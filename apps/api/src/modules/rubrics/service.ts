import { validateRubric, type CriterionDef, type MetricConfig, type RubricDef } from "@orbita/domain";
import type { PrismaClient } from "../../db/client.js";
import { OrbitaError, Errors } from "../../errors.js";
import type { LocalizedText } from "../../lib/localized.js";
import type { AuditContext } from "../../lib/request-context.js";
import { writeAudit } from "../audit/writer.js";

/**
 * Rubric service.
 *
 * One `Rubric` per (specialty, purpose) — the schema's unique guarantees
 * that. A rubric owns many `RubricVersion`s, each with its own criteria.
 * The lifecycle is: `DRAFT` (editable) → `ACTIVE` (frozen, used by new
 * assessments) → `RETIRED` (kept for reproducibility). Only one version
 * per rubric may be `ACTIVE` at a time; activating a new version retires
 * the current one in the same transaction.
 *
 * A version becomes **immutable at the DB level** (`isLocked = true`,
 * trigger-enforced — D-36) when the first `Assessment` references it.
 * This service's own edit paths refuse non-DRAFT writes earlier so the
 * trigger is a safety net, not the first line of defence.
 *
 * Clone-on-edit: once a version is ACTIVE, the admin cannot change it;
 * they call `cloneVersion` to get a fresh DRAFT with the same criteria
 * and next version number (unique per rubric).
 */

export interface CriterionDTO {
  readonly id: string;
  readonly key: string;
  readonly name: LocalizedText;
  readonly competencyId: string | null;
  readonly weightBp: number;
  readonly method: "AUTO_QUIZ" | "MANUAL" | "EVIDENCE_METRIC";
  readonly metricConfig: MetricConfig | null;
  readonly isGate: boolean;
  readonly gateMinScore: number | null;
  readonly evidenceRequired: boolean;
  readonly minEvidenceCount: number;
  readonly allowNotApplicable: boolean;
  readonly sortOrder: number;
}

export interface VersionDTO {
  readonly id: string;
  readonly rubricId: string;
  readonly version: number;
  readonly status: "DRAFT" | "ACTIVE" | "RETIRED";
  readonly isLocked: boolean;
  readonly allowRenormalization: boolean;
  readonly passThreshold: number | null;
  readonly changeNote: string | null;
  readonly createdById: string;
  readonly createdAt: string;
  readonly activatedAt: string | null;
  readonly criteria: readonly CriterionDTO[];
  readonly weightTotalBp: number;
}

export interface RubricDTO {
  readonly id: string;
  readonly specialtyId: string;
  readonly purpose: "CANDIDATE" | "PERFORMANCE" | "LEVEL_REVIEW";
  readonly name: LocalizedText;
  readonly versions: readonly VersionDTO[];
}

function versionDTO(row: {
  id: string;
  rubricId: string;
  version: number;
  status: string;
  isLocked: boolean;
  allowRenormalization: boolean;
  passThreshold: number | null;
  changeNote: string | null;
  createdById: string;
  createdAt: Date;
  activatedAt: Date | null;
  criteria: {
    id: string;
    key: string;
    name: unknown;
    competencyId: string | null;
    weightBp: number;
    method: string;
    metricConfig: unknown;
    isGate: boolean;
    gateMinScore: number | null;
    evidenceRequired: boolean;
    minEvidenceCount: number;
    allowNotApplicable: boolean;
    sortOrder: number;
  }[];
}): VersionDTO {
  const criteria = [...row.criteria].sort((a, b) => a.sortOrder - b.sortOrder || a.key.localeCompare(b.key));
  return {
    id: row.id,
    rubricId: row.rubricId,
    version: row.version,
    status: row.status as "DRAFT" | "ACTIVE" | "RETIRED",
    isLocked: row.isLocked,
    allowRenormalization: row.allowRenormalization,
    passThreshold: row.passThreshold,
    changeNote: row.changeNote,
    createdById: row.createdById,
    createdAt: row.createdAt.toISOString(),
    activatedAt: row.activatedAt?.toISOString() ?? null,
    criteria: criteria.map((c) => ({
      id: c.id,
      key: c.key,
      name: c.name as LocalizedText,
      competencyId: c.competencyId,
      weightBp: c.weightBp,
      method: c.method as "AUTO_QUIZ" | "MANUAL" | "EVIDENCE_METRIC",
      metricConfig: (c.metricConfig as MetricConfig | null | undefined) ?? null,
      isGate: c.isGate,
      gateMinScore: c.gateMinScore,
      evidenceRequired: c.evidenceRequired,
      minEvidenceCount: c.minEvidenceCount,
      allowNotApplicable: c.allowNotApplicable,
      sortOrder: c.sortOrder,
    })),
    weightTotalBp: criteria.reduce((sum, c) => sum + c.weightBp, 0),
  };
}

export async function listRubrics(prisma: PrismaClient, orgId: string): Promise<RubricDTO[]> {
  const rows = await prisma.rubric.findMany({
    where: { specialty: { orgId } },
    include: { versions: { include: { criteria: true }, orderBy: { version: "desc" } } },
    orderBy: { createdAt: "asc" },
  });
  return rows.map((r) => ({
    id: r.id,
    specialtyId: r.specialtyId,
    purpose: r.purpose,
    name: r.name as LocalizedText,
    versions: r.versions.map(versionDTO),
  }));
}

export interface CreateRubricInput {
  readonly specialtyId: string;
  readonly purpose: "CANDIDATE" | "PERFORMANCE" | "LEVEL_REVIEW";
  readonly name: LocalizedText;
}

export async function createRubric(
  prisma: PrismaClient,
  orgId: string,
  input: CreateRubricInput,
  audit: AuditContext,
): Promise<{ rubric: RubricDTO; versionId: string }> {
  const specialty = await prisma.specialty.findUnique({ where: { id: input.specialtyId } });
  if (specialty === null || specialty.orgId !== orgId) throw Errors.notFound("Specialty");

  const existing = await prisma.rubric.findUnique({
    where: { specialtyId_purpose: { specialtyId: input.specialtyId, purpose: input.purpose } },
  });
  if (existing !== null) {
    throw new OrbitaError({
      code: "orbita:rubric:duplicate_purpose",
      status: 409,
      title: "A rubric with this purpose already exists for this specialty",
    });
  }

  const { rubric, version } = await prisma.$transaction(async (tx) => {
    const r = await tx.rubric.create({
      data: { specialtyId: input.specialtyId, purpose: input.purpose, name: input.name },
    });
    const v = await tx.rubricVersion.create({
      data: { rubricId: r.id, version: 1, status: "DRAFT", createdById: audit.actorId },
    });
    await writeAudit(tx, {
      orgId,
      actorId: audit.actorId,
      action: "rubric.created",
      entityType: "Rubric",
      entityId: r.id,
      after: { specialtyId: input.specialtyId, purpose: input.purpose, name: input.name },
      requestId: audit.requestId,
      ip: audit.ip,
    });
    return { rubric: r, version: v };
  });
  const full = await prisma.rubric.findUniqueOrThrow({
    where: { id: rubric.id },
    include: { versions: { include: { criteria: true } } },
  });
  return {
    rubric: {
      id: full.id,
      specialtyId: full.specialtyId,
      purpose: full.purpose,
      name: full.name as LocalizedText,
      versions: full.versions.map(versionDTO),
    },
    versionId: version.id,
  };
}

export async function getVersion(
  prisma: PrismaClient,
  orgId: string,
  versionId: string,
): Promise<VersionDTO> {
  const row = await prisma.rubricVersion.findUnique({
    where: { id: versionId },
    include: { criteria: true, rubric: { include: { specialty: true } } },
  });
  if (row === null || row.rubric.specialty.orgId !== orgId) throw Errors.notFound("Rubric version");
  return versionDTO(row);
}

/**
 * Clone an existing version — ACTIVE or RETIRED. The new row is a fresh
 * DRAFT with the next sequential `version` number. Criteria are
 * recreated with new ids so edits to the clone never touch the source.
 */
export async function cloneVersion(
  prisma: PrismaClient,
  orgId: string,
  sourceVersionId: string,
  changeNote: string | null,
  audit: AuditContext,
): Promise<VersionDTO> {
  const source = await prisma.rubricVersion.findUnique({
    where: { id: sourceVersionId },
    include: { criteria: true, rubric: { include: { specialty: true } } },
  });
  if (source === null || source.rubric.specialty.orgId !== orgId) throw Errors.notFound("Rubric version");

  const max = await prisma.rubricVersion.aggregate({
    where: { rubricId: source.rubricId },
    _max: { version: true },
  });
  const nextVersion = (max._max.version ?? 0) + 1;

  const created = await prisma.$transaction(async (tx) => {
    const v = await tx.rubricVersion.create({
      data: {
        rubricId: source.rubricId,
        version: nextVersion,
        status: "DRAFT",
        allowRenormalization: source.allowRenormalization,
        passThreshold: source.passThreshold,
        changeNote,
        createdById: audit.actorId,
      },
    });
    for (const c of source.criteria) {
      await tx.rubricCriterion.create({
        data: {
          rubricVersionId: v.id,
          key: c.key,
          name: c.name as never,
          ...(c.description !== null ? { description: c.description as never } : {}),
          competencyId: c.competencyId,
          weightBp: c.weightBp,
          method: c.method,
          ...(c.metricConfig !== null ? { metricConfig: c.metricConfig as never } : {}),
          isGate: c.isGate,
          gateMinScore: c.gateMinScore,
          evidenceRequired: c.evidenceRequired,
          minEvidenceCount: c.minEvidenceCount,
          allowNotApplicable: c.allowNotApplicable,
          sortOrder: c.sortOrder,
        },
      });
    }
    await writeAudit(tx, {
      orgId,
      actorId: audit.actorId,
      action: "rubric_version.cloned",
      entityType: "RubricVersion",
      entityId: v.id,
      after: { sourceVersionId, version: nextVersion, changeNote },
      requestId: audit.requestId,
      ip: audit.ip,
    });
    return v;
  });
  return getVersion(prisma, orgId, created.id);
}

function requireDraft(row: { status: string; isLocked: boolean }, action: string): void {
  if (row.isLocked) {
    throw new OrbitaError({
      code: "orbita:rubric_version:locked",
      status: 409,
      title: `Rubric version is locked (first assessment created); ${action} refused`,
    });
  }
  if (row.status !== "DRAFT") {
    throw new OrbitaError({
      code: "orbita:rubric_version:not_draft",
      status: 409,
      title: `Rubric version is ${row.status}; ${action} only allowed on DRAFT`,
    });
  }
}

export interface CriterionInput {
  readonly key: string;
  readonly name: LocalizedText;
  readonly description?: LocalizedText | undefined;
  readonly competencyId?: string | null | undefined;
  readonly weightBp: number;
  readonly method: "AUTO_QUIZ" | "MANUAL" | "EVIDENCE_METRIC";
  /** Raw JSON pass-through; validated at activation by the domain rubric check. */
  readonly metricConfig?: Record<string, unknown> | null | undefined;
  readonly isGate?: boolean | undefined;
  readonly gateMinScore?: number | null | undefined;
  readonly evidenceRequired?: boolean | undefined;
  readonly minEvidenceCount?: number | undefined;
  readonly allowNotApplicable?: boolean | undefined;
  readonly sortOrder?: number | undefined;
}

export async function upsertCriterion(
  prisma: PrismaClient,
  orgId: string,
  versionId: string,
  input: CriterionInput,
  audit: AuditContext,
): Promise<CriterionDTO> {
  const version = await prisma.rubricVersion.findUnique({
    where: { id: versionId },
    include: { rubric: { include: { specialty: true } } },
  });
  if (version === null || version.rubric.specialty.orgId !== orgId) throw Errors.notFound("Rubric version");
  requireDraft(version, "edit");

  if (!/^[a-z0-9][a-z0-9_-]{0,62}$/.test(input.key)) {
    throw Errors.validation([{ path: "key", message: "Invalid criterion key" }]);
  }
  if (input.weightBp < 0 || input.weightBp > 10000) {
    throw Errors.validation([{ path: "weightBp", message: "weightBp must be in [0, 10000]" }]);
  }
  if (input.competencyId !== undefined && input.competencyId !== null) {
    const comp = await prisma.competency.findUnique({ where: { id: input.competencyId } });
    if (comp === null || comp.orgId !== orgId) throw Errors.notFound("Competency");
  }

  const existing = await prisma.rubricCriterion.findUnique({
    where: { rubricVersionId_key: { rubricVersionId: versionId, key: input.key } },
  });
  const row = await prisma.$transaction(async (tx) => {
    const data = {
      key: input.key,
      name: input.name as never,
      ...(input.description !== undefined ? { description: input.description as never } : {}),
      competencyId: input.competencyId ?? null,
      weightBp: input.weightBp,
      method: input.method,
      ...(input.metricConfig !== undefined ? { metricConfig: input.metricConfig as never } : {}),
      isGate: input.isGate ?? false,
      gateMinScore: input.gateMinScore ?? null,
      evidenceRequired: input.evidenceRequired ?? false,
      minEvidenceCount: input.minEvidenceCount ?? 0,
      allowNotApplicable: input.allowNotApplicable ?? false,
      sortOrder: input.sortOrder ?? 0,
    };
    const saved =
      existing === null
        ? await tx.rubricCriterion.create({ data: { rubricVersionId: versionId, ...data } })
        : await tx.rubricCriterion.update({ where: { id: existing.id }, data });
    await writeAudit(tx, {
      orgId,
      actorId: audit.actorId,
      action: existing === null ? "rubric_criterion.created" : "rubric_criterion.updated",
      entityType: "RubricCriterion",
      entityId: saved.id,
      ...(existing !== null
        ? { before: { key: existing.key, weightBp: existing.weightBp, method: existing.method } }
        : {}),
      after: { key: input.key, weightBp: input.weightBp, method: input.method },
      requestId: audit.requestId,
      ip: audit.ip,
    });
    return saved;
  });
  return {
    id: row.id,
    key: row.key,
    name: row.name as LocalizedText,
    competencyId: row.competencyId,
    weightBp: row.weightBp,
    method: row.method,
    metricConfig: (row.metricConfig as MetricConfig | null) ?? null,
    isGate: row.isGate,
    gateMinScore: row.gateMinScore,
    evidenceRequired: row.evidenceRequired,
    minEvidenceCount: row.minEvidenceCount,
    allowNotApplicable: row.allowNotApplicable,
    sortOrder: row.sortOrder,
  };
}

export async function removeCriterion(
  prisma: PrismaClient,
  orgId: string,
  versionId: string,
  criterionId: string,
  audit: AuditContext,
): Promise<void> {
  const version = await prisma.rubricVersion.findUnique({
    where: { id: versionId },
    include: { rubric: { include: { specialty: true } } },
  });
  if (version === null || version.rubric.specialty.orgId !== orgId) throw Errors.notFound("Rubric version");
  requireDraft(version, "delete");

  await prisma.$transaction(async (tx) => {
    await tx.rubricCriterion.deleteMany({ where: { id: criterionId, rubricVersionId: versionId } });
    await writeAudit(tx, {
      orgId,
      actorId: audit.actorId,
      action: "rubric_criterion.removed",
      entityType: "RubricCriterion",
      entityId: criterionId,
      requestId: audit.requestId,
      ip: audit.ip,
    });
  });
}

/**
 * Validate and activate a DRAFT version. The domain's `validateRubric()`
 * owns the real rule (weights sum to 10000, no duplicate measure reads,
 * gate scores set, …); we reshape the DB rows into the pure interface
 * and surface its issues as a 400 so the editor can show them all at
 * once. Activation retires any prior ACTIVE version in the same tx.
 */
export async function activateVersion(
  prisma: PrismaClient,
  orgId: string,
  versionId: string,
  audit: AuditContext,
): Promise<VersionDTO> {
  const version = await prisma.rubricVersion.findUnique({
    where: { id: versionId },
    include: {
      criteria: { include: { competency: true } },
      rubric: { include: { specialty: true } },
    },
  });
  if (version === null || version.rubric.specialty.orgId !== orgId) throw Errors.notFound("Rubric version");
  if (version.status !== "DRAFT") {
    throw new OrbitaError({
      code: "orbita:rubric_version:not_draft",
      status: 409,
      title: `Rubric version is ${version.status}; only DRAFT can be activated`,
    });
  }

  const def: RubricDef = {
    allowRenormalization: version.allowRenormalization,
    criteria: version.criteria.map((c): CriterionDef => ({
      key: c.key,
      ...(c.competency !== null ? { competencyKey: c.competency.key } : {}),
      weightBp: BigInt(c.weightBp),
      method: c.method,
      ...(c.metricConfig !== null ? { metric: c.metricConfig as unknown as MetricConfig } : {}),
      isGate: c.isGate,
      ...(c.gateMinScore !== null ? { gateMinScore: BigInt(c.gateMinScore) } : {}),
      evidenceRequired: c.evidenceRequired,
      minEvidenceCount: c.minEvidenceCount,
      allowNotApplicable: c.allowNotApplicable,
    })),
  };
  const result = validateRubric(def);
  if (!result.ok) {
    throw new OrbitaError({
      code: "orbita:rubric_version:invalid",
      status: 400,
      title: "Rubric does not satisfy its constraints",
      detail: JSON.stringify((result.error as unknown as { issues: unknown }).issues),
    });
  }

  const activated = await prisma.$transaction(async (tx) => {
    // Retire whatever is currently ACTIVE for this rubric.
    await tx.rubricVersion.updateMany({
      where: { rubricId: version.rubricId, status: "ACTIVE" },
      data: { status: "RETIRED" },
    });
    const row = await tx.rubricVersion.update({
      where: { id: versionId },
      data: { status: "ACTIVE", activatedAt: new Date() },
      include: { criteria: true },
    });
    await writeAudit(tx, {
      orgId,
      actorId: audit.actorId,
      action: "rubric_version.activated",
      entityType: "RubricVersion",
      entityId: versionId,
      after: { version: row.version },
      requestId: audit.requestId,
      ip: audit.ip,
    });
    return row;
  });
  return versionDTO({
    ...activated,
    rubricId: activated.rubricId,
  });
}
