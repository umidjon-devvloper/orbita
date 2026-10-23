"use client";

import { Pencil, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { ApiError, apiFetch } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { Competency, Specialty } from "../catalog/client";

type Purpose = "CANDIDATE" | "PERFORMANCE" | "LEVEL_REVIEW";
type Method = "AUTO_QUIZ" | "MANUAL" | "EVIDENCE_METRIC";
type Status = "DRAFT" | "ACTIVE" | "RETIRED";

interface Localized {
  uz: string;
  ru?: string;
  en?: string;
}

export interface Criterion {
  readonly id: string;
  readonly key: string;
  readonly name: Localized;
  readonly competencyId: string | null;
  readonly weightBp: number;
  readonly method: Method;
  readonly metricConfig: Record<string, unknown> | null;
  readonly isGate: boolean;
  readonly gateMinScore: number | null;
  readonly evidenceRequired: boolean;
  readonly minEvidenceCount: number;
  readonly allowNotApplicable: boolean;
  readonly sortOrder: number;
}

export interface Version {
  readonly id: string;
  readonly version: number;
  readonly status: Status;
  readonly isLocked: boolean;
  readonly criteria: readonly Criterion[];
  readonly weightTotalBp: number;
}

export interface Rubric {
  readonly id: string;
  readonly specialtyId: string;
  readonly purpose: Purpose;
  readonly name: Localized;
  readonly versions: readonly Version[];
}

/**
 * Rubric builder.
 *
 * Three-pane layout: a sidebar lists rubrics (grouped by specialty) so
 * jumping between a candidate rubric and its performance twin is one
 * click; the main pane shows the selected rubric with a tab per version
 * (newest first) and, inside that, a criteria table plus an inline
 * editor. The weight meter is always visible because 10000 is the one
 * number that gates activation.
 */
export function RubricsClient({
  initialRubrics,
  specialties,
  competencies,
  locale,
}: {
  readonly initialRubrics: readonly Rubric[];
  readonly specialties: readonly Specialty[];
  readonly competencies: readonly Competency[];
  readonly locale: string;
}) {
  const t = useTranslations("settings.rubrics");
  const tc = useTranslations("settings.common");
  const router = useRouter();
  const [rubrics, setRubrics] = useState<readonly Rubric[]>(initialRubrics);
  const [selectedId, setSelectedId] = useState<string | null>(initialRubrics[0]?.id ?? null);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(
    initialRubrics[0]?.versions[0]?.id ?? null,
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showCreate, setShowCreate] = useState(false);

  const selected = useMemo(() => rubrics.find((r) => r.id === selectedId) ?? null, [rubrics, selectedId]);
  const version = useMemo(
    () => selected?.versions.find((v) => v.id === selectedVersionId) ?? selected?.versions[0] ?? null,
    [selected, selectedVersionId],
  );

  const specialtyName = (id: string): string => {
    const s = specialties.find((x) => x.id === id);
    if (s === undefined) return id.slice(0, 8);
    return s.name[locale as "uz" | "ru" | "en"] ?? s.name.uz;
  };

  async function reload(preferRubricId?: string, preferVersionId?: string) {
    const data = await apiFetch<{ rubrics: Rubric[] }>("/api/v1/rubrics");
    setRubrics(data.rubrics);
    const nextId = preferRubricId ?? selectedId ?? data.rubrics[0]?.id ?? null;
    setSelectedId(nextId);
    const nextRubric = data.rubrics.find((r) => r.id === nextId);
    setSelectedVersionId(preferVersionId ?? nextRubric?.versions[0]?.id ?? null);
    router.refresh();
  }

  async function createRubric(input: { specialtyId: string; purpose: Purpose; nameUz: string }) {
    setError(null);
    setBusy(true);
    try {
      const res = await apiFetch<{ rubric: Rubric; versionId: string }>("/api/v1/rubrics", {
        method: "POST",
        body: {
          specialtyId: input.specialtyId,
          purpose: input.purpose,
          name: { uz: input.nameUz },
        },
      });
      setShowCreate(false);
      await reload(res.rubric.id, res.versionId);
    } catch (err) {
      setError(mapError(err, t));
    } finally {
      setBusy(false);
    }
  }

  async function activate(versionId: string) {
    setError(null);
    setBusy(true);
    try {
      await apiFetch(`/api/v1/rubrics/versions/${versionId}/activate`, { method: "POST" });
      await reload(selectedId ?? undefined, versionId);
    } catch (err) {
      setError(mapError(err, t));
    } finally {
      setBusy(false);
    }
  }

  async function clone(versionId: string) {
    setError(null);
    setBusy(true);
    try {
      const res = await apiFetch<{ version: Version }>(`/api/v1/rubrics/versions/${versionId}/clone`, {
        method: "POST",
        body: {},
      });
      await reload(selectedId ?? undefined, res.version.id);
    } catch (err) {
      setError(mapError(err, t));
    } finally {
      setBusy(false);
    }
  }

  async function upsertCriterion(versionId: string, input: CriterionInput) {
    setError(null);
    setBusy(true);
    try {
      await apiFetch(`/api/v1/rubrics/versions/${versionId}/criteria`, {
        method: "PUT",
        body: input,
      });
      await reload(selectedId ?? undefined, versionId);
    } catch (err) {
      setError(mapError(err, t));
      throw err;
    } finally {
      setBusy(false);
    }
  }

  async function removeCriterion(versionId: string, criterionId: string) {
    setError(null);
    setBusy(true);
    try {
      await apiFetch(`/api/v1/rubrics/versions/${versionId}/criteria/${criterionId}`, {
        method: "DELETE",
      });
      await reload(selectedId ?? undefined, versionId);
    } catch (err) {
      setError(mapError(err, t));
    } finally {
      setBusy(false);
    }
  }

  if (specialties.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-rule p-6 text-sm text-fg-muted">
        {locale === "ru"
          ? "Сначала создайте специальности в разделе каталога."
          : locale === "en"
            ? "Create specialties in Catalog first."
            : "Avval Katalog bo'limida mutaxassislik yarating."}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {error !== null && (
        <p
          role="alert"
          className="text-sm text-critical rounded-sm bg-critical-soft px-3 py-2 whitespace-pre-wrap"
        >
          {error}
        </p>
      )}

      <div className="flex items-center justify-between">
        <p className="text-sm text-fg-muted">
          {rubrics.length} {rubrics.length === 1 ? "rubric" : "rubrics"}
        </p>
        <Button
          size="sm"
          onClick={() => {
            setShowCreate(true);
          }}
        >
          + {t("newRubric")}
        </Button>
      </div>

      {showCreate && (
        <CreateRubricForm
          specialties={specialties}
          onCancel={() => {
            setShowCreate(false);
          }}
          onCreate={createRubric}
          busy={busy}
        />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-4">
        <aside className="border border-rule rounded-lg bg-surface overflow-hidden">
          {rubrics.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-fg-muted">{t("noRubrics")}</p>
          ) : (
            <ul className="divide-y divide-rule">
              {rubrics.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedId(r.id);
                      setSelectedVersionId(r.versions[0]?.id ?? null);
                    }}
                    className={`block w-full text-left px-3 py-2.5 hover:bg-surface-sunken transition-colors ${
                      r.id === selectedId ? "bg-surface-sunken" : ""
                    }`}
                  >
                    <p className="text-sm font-medium truncate">
                      {r.name[locale as "uz" | "ru" | "en"] ?? r.name.uz}
                    </p>
                    <p className="text-xs text-fg-dim truncate">
                      {specialtyName(r.specialtyId)} ·{" "}
                      <span className="font-mono">{purposeLabel(r.purpose, t)}</span>
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        <section className="min-w-0">
          {selected === null || version === null ? (
            <div className="rounded-lg border border-dashed border-rule p-10 text-center text-sm text-fg-muted">
              {t("noRubrics")}
            </div>
          ) : (
            <VersionPane
              rubric={selected}
              version={version}
              competencies={competencies}
              onSelectVersion={setSelectedVersionId}
              onActivate={activate}
              onClone={clone}
              onUpsertCriterion={upsertCriterion}
              onRemoveCriterion={removeCriterion}
              busy={busy}
              locale={locale}
              t={t}
              tc={tc}
            />
          )}
        </section>
      </div>
    </div>
  );
}

function CreateRubricForm({
  specialties,
  onCancel,
  onCreate,
  busy,
}: {
  readonly specialties: readonly Specialty[];
  readonly onCancel: () => void;
  readonly onCreate: (input: { specialtyId: string; purpose: Purpose; nameUz: string }) => Promise<void>;
  readonly busy: boolean;
}) {
  const t = useTranslations("settings.rubrics");
  const tc = useTranslations("settings.common");
  const [specialtyId, setSpecialtyId] = useState(specialties[0]?.id ?? "");
  const [purpose, setPurpose] = useState<Purpose>("PERFORMANCE");
  const [nameUz, setNameUz] = useState("");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void onCreate({ specialtyId, purpose, nameUz: nameUz.trim() });
      }}
      className="rounded-lg border border-rule bg-surface p-4 grid grid-cols-1 sm:grid-cols-3 gap-3"
    >
      <Field htmlFor="r-spec" label={t("specialty")}>
        <select
          id="r-spec"
          value={specialtyId}
          onChange={(e) => {
            setSpecialtyId(e.target.value);
          }}
          className="h-9 rounded-md border border-rule bg-surface px-2 text-sm"
          required
        >
          {specialties.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name.uz}
            </option>
          ))}
        </select>
      </Field>
      <Field htmlFor="r-purpose" label={t("purpose")}>
        <select
          id="r-purpose"
          value={purpose}
          onChange={(e) => {
            setPurpose(e.target.value as Purpose);
          }}
          className="h-9 rounded-md border border-rule bg-surface px-2 text-sm"
          required
        >
          <option value="PERFORMANCE">{t("purposePerformance")}</option>
          <option value="CANDIDATE">{t("purposeCandidate")}</option>
          <option value="LEVEL_REVIEW">{t("purposeLevelReview")}</option>
        </select>
      </Field>
      <Field htmlFor="r-name" label={tc("nameUz")}>
        <Input
          id="r-name"
          value={nameUz}
          onChange={(e) => {
            setNameUz(e.target.value);
          }}
          required
        />
      </Field>
      <div className="sm:col-span-3 flex items-center justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          {tc("cancel")}
        </Button>
        <Button type="submit" disabled={busy || nameUz.trim() === "" || specialtyId === ""}>
          {tc("create")}
        </Button>
      </div>
    </form>
  );
}

interface CriterionInput {
  key: string;
  name: Localized;
  description?: Localized;
  competencyId: string | null;
  weightBp: number;
  method: Method;
  metricConfig: Record<string, unknown> | null;
  isGate: boolean;
  gateMinScore: number | null;
  evidenceRequired: boolean;
  minEvidenceCount: number;
  sortOrder: number;
}

function VersionPane({
  rubric,
  version,
  competencies,
  onSelectVersion,
  onActivate,
  onClone,
  onUpsertCriterion,
  onRemoveCriterion,
  busy,
  locale,
  t,
  tc,
}: {
  readonly rubric: Rubric;
  readonly version: Version;
  readonly competencies: readonly Competency[];
  readonly onSelectVersion: (id: string) => void;
  readonly onActivate: (versionId: string) => Promise<void>;
  readonly onClone: (versionId: string) => Promise<void>;
  readonly onUpsertCriterion: (versionId: string, input: CriterionInput) => Promise<void>;
  readonly onRemoveCriterion: (versionId: string, criterionId: string) => Promise<void>;
  readonly busy: boolean;
  readonly locale: string;
  readonly t: ReturnType<typeof useTranslations>;
  readonly tc: ReturnType<typeof useTranslations>;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const editable = version.status === "DRAFT" && !version.isLocked;
  const weight = version.weightTotalBp;
  const weightOk = weight === 10000;

  return (
    <div className="flex flex-col gap-4 border border-rule rounded-lg bg-surface p-4">
      <header className="flex flex-wrap items-start gap-3 justify-between">
        <div className="min-w-0">
          <h2 className="text-base font-semibold">
            {rubric.name[locale as "uz" | "ru" | "en"] ?? rubric.name.uz}
          </h2>
          <p className="text-xs text-fg-dim font-mono">{purposeLabel(rubric.purpose, t)}</p>
        </div>
        <div className="flex items-center gap-2">
          {editable && (
            <Button
              size="sm"
              disabled={busy || !weightOk || version.criteria.length === 0}
              onClick={() => {
                void onActivate(version.id);
              }}
            >
              {t("activate")}
            </Button>
          )}
          {!editable && (
            <Button
              size="sm"
              variant="secondary"
              disabled={busy}
              onClick={() => {
                void onClone(version.id);
              }}
            >
              {t("clone")}
            </Button>
          )}
        </div>
      </header>

      {rubric.versions.length > 0 && (
        <nav className="flex flex-wrap gap-1">
          {rubric.versions.map((v) => (
            <button
              key={v.id}
              type="button"
              onClick={() => {
                onSelectVersion(v.id);
              }}
              className={`text-xs font-mono px-2 py-1 rounded border ${
                v.id === version.id
                  ? "border-rule-strong bg-surface-sunken"
                  : "border-rule bg-surface hover:bg-surface-sunken"
              }`}
            >
              v{v.version.toString()} · {statusChip(v.status, t)}
              {v.isLocked ? ` · ${t("locked")}` : ""}
            </button>
          ))}
        </nav>
      )}

      <div className="flex items-center gap-3 text-xs">
        <span className="text-fg-muted">{t("weightTotal")}:</span>
        <span className={`font-mono tabular-nums font-semibold ${weightOk ? "text-good" : "text-warn"}`}>
          {weight.toString()} / 10000
        </span>
        {!weightOk && <span className="text-fg-dim">— {t("weightTarget")}</span>}
      </div>

      {version.criteria.length === 0 ? (
        <p className="rounded-md border border-dashed border-rule p-6 text-center text-sm text-fg-muted">
          {t("noCriteria")}
        </p>
      ) : (
        <ul className="divide-y divide-rule border border-rule rounded-md overflow-hidden">
          {[...version.criteria]
            .sort((a, b) => a.sortOrder - b.sortOrder || a.key.localeCompare(b.key))
            .map((c) => (
              <li key={c.id}>
                {editable && editingId === c.id ? (
                  <CriterionForm
                    versionId={version.id}
                    initial={c}
                    competencies={competencies}
                    onCancel={() => {
                      setEditingId(null);
                    }}
                    onSave={async (input) => {
                      await onUpsertCriterion(version.id, input);
                      setEditingId(null);
                    }}
                    busy={busy}
                    locale={locale}
                    t={t}
                    tc={tc}
                  />
                ) : (
                  <div className="grid grid-cols-[auto_1fr_auto_auto_auto] gap-3 px-3 py-2.5 items-center">
                    <span className="font-mono text-xs text-fg-dim w-8 shrink-0">
                      {c.sortOrder.toString()}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">
                        {c.name[locale as "uz" | "ru" | "en"] ?? c.name.uz}
                      </p>
                      <p className="text-xs text-fg-dim font-mono truncate">
                        {c.key} · {methodLabel(c.method, t)}
                        {c.isGate ? ` · gate ≥ ${(c.gateMinScore ?? 0).toString()}` : ""}
                      </p>
                    </div>
                    <span className="text-sm font-mono tabular-nums text-right">
                      {c.weightBp.toString()} bp
                    </span>
                    {editable ? (
                      <>
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-label={tc("save")}
                          onClick={() => {
                            setEditingId(c.id);
                          }}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-label="delete"
                          disabled={busy}
                          onClick={() => {
                            if (window.confirm("Delete?")) {
                              void onRemoveCriterion(version.id, c.id);
                            }
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </>
                    ) : (
                      <>
                        <span />
                        <span />
                      </>
                    )}
                  </div>
                )}
              </li>
            ))}
        </ul>
      )}

      {editable && !showAdd && editingId === null && (
        <div className="flex justify-end">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              setShowAdd(true);
            }}
          >
            + {t("addCriterion")}
          </Button>
        </div>
      )}

      {editable && showAdd && (
        <CriterionForm
          versionId={version.id}
          initial={null}
          competencies={competencies}
          onCancel={() => {
            setShowAdd(false);
          }}
          onSave={async (input) => {
            await onUpsertCriterion(version.id, input);
            setShowAdd(false);
          }}
          busy={busy}
          locale={locale}
          t={t}
          tc={tc}
        />
      )}
    </div>
  );
}

function CriterionForm({
  initial,
  competencies,
  onCancel,
  onSave,
  busy,
  t,
  tc,
}: {
  readonly versionId: string;
  readonly initial: Criterion | null;
  readonly competencies: readonly Competency[];
  readonly onCancel: () => void;
  readonly onSave: (input: CriterionInput) => Promise<void>;
  readonly busy: boolean;
  readonly locale: string;
  readonly t: ReturnType<typeof useTranslations>;
  readonly tc: ReturnType<typeof useTranslations>;
}) {
  const [key, setKey] = useState(initial?.key ?? "");
  const [nameUz, setNameUz] = useState(initial?.name.uz ?? "");
  const [weightBp, setWeightBp] = useState<string>(initial?.weightBp.toString() ?? "1000");
  const [method, setMethod] = useState<Method>(initial?.method ?? "MANUAL");
  const [competencyId, setCompetencyId] = useState<string>(initial?.competencyId ?? "");
  const [isGate, setIsGate] = useState(initial?.isGate ?? false);
  const [gateMinScore, setGateMinScore] = useState<string>(initial?.gateMinScore?.toString() ?? "6000");
  const [evidenceRequired, setEvidenceRequired] = useState(initial?.evidenceRequired ?? false);
  const [minEvidenceCount, setMinEvidenceCount] = useState<string>(
    initial?.minEvidenceCount.toString() ?? "0",
  );
  const [sortOrder, setSortOrder] = useState<string>(initial?.sortOrder.toString() ?? "0");
  const [metricConfigText, setMetricConfigText] = useState<string>(
    initial?.metricConfig !== null && initial?.metricConfig !== undefined
      ? JSON.stringify(initial.metricConfig, null, 2)
      : "",
  );
  const [localError, setLocalError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLocalError(null);
    let metricConfig: Record<string, unknown> | null = null;
    if (metricConfigText.trim() !== "") {
      try {
        const parsed: unknown = JSON.parse(metricConfigText);
        if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
          setLocalError(t("invalidJson"));
          return;
        }
        metricConfig = parsed as Record<string, unknown>;
      } catch {
        setLocalError(t("invalidJson"));
        return;
      }
    }
    const w = Number.parseInt(weightBp, 10);
    if (!Number.isFinite(w) || w < 0 || w > 10000) {
      setLocalError(t("weightBp"));
      return;
    }
    try {
      await onSave({
        key: key.trim(),
        name: { uz: nameUz.trim() },
        competencyId: competencyId === "" ? null : competencyId,
        weightBp: w,
        method,
        metricConfig,
        isGate,
        gateMinScore: isGate ? Number.parseInt(gateMinScore, 10) : null,
        evidenceRequired,
        minEvidenceCount: Number.parseInt(minEvidenceCount, 10) || 0,
        sortOrder: Number.parseInt(sortOrder, 10) || 0,
      });
    } catch {
      // parent surfaces error through its own banner
    }
  }

  return (
    <form
      onSubmit={(e) => void submit(e)}
      className="bg-surface-sunken p-4 grid grid-cols-1 sm:grid-cols-6 gap-3"
    >
      {localError !== null && <p className="sm:col-span-6 text-sm text-critical">{localError}</p>}
      <Field htmlFor="c-sort" label={t("sortOrder")}>
        <Input
          id="c-sort"
          inputMode="numeric"
          value={sortOrder}
          onChange={(e) => {
            setSortOrder(e.target.value);
          }}
          className="w-16"
        />
      </Field>
      <Field htmlFor="c-key" label={tc("key")}>
        <Input
          id="c-key"
          value={key}
          onChange={(e) => {
            setKey(e.target.value);
          }}
          required
        />
      </Field>
      <div className="sm:col-span-4">
        <Field htmlFor="c-name" label={tc("nameUz")}>
          <Input
            id="c-name"
            value={nameUz}
            onChange={(e) => {
              setNameUz(e.target.value);
            }}
            required
          />
        </Field>
      </div>

      <Field htmlFor="c-weight" label={t("weightBp")}>
        <Input
          id="c-weight"
          inputMode="numeric"
          value={weightBp}
          onChange={(e) => {
            setWeightBp(e.target.value);
          }}
          required
        />
      </Field>
      <div className="sm:col-span-2">
        <Field htmlFor="c-method" label={t("method")}>
          <select
            id="c-method"
            value={method}
            onChange={(e) => {
              setMethod(e.target.value as Method);
            }}
            className="h-9 w-full rounded-md border border-rule bg-surface px-2 text-sm"
          >
            <option value="MANUAL">{t("methodManual")}</option>
            <option value="AUTO_QUIZ">{t("methodAutoQuiz")}</option>
            <option value="EVIDENCE_METRIC">{t("methodEvidenceMetric")}</option>
          </select>
        </Field>
      </div>
      <div className="sm:col-span-3">
        <Field htmlFor="c-comp" label="Competency">
          <select
            id="c-comp"
            value={competencyId}
            onChange={(e) => {
              setCompetencyId(e.target.value);
            }}
            className="h-9 w-full rounded-md border border-rule bg-surface px-2 text-sm"
          >
            <option value="">—</option>
            {competencies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name.uz}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <label className="sm:col-span-2 flex items-center gap-2 text-sm pt-6">
        <input
          type="checkbox"
          checked={isGate}
          onChange={(e) => {
            setIsGate(e.target.checked);
          }}
        />
        {t("isGate")}
      </label>
      {isGate && (
        <Field htmlFor="c-gate" label={t("gateMinScore")}>
          <Input
            id="c-gate"
            inputMode="numeric"
            value={gateMinScore}
            onChange={(e) => {
              setGateMinScore(e.target.value);
            }}
          />
        </Field>
      )}
      <label className="sm:col-span-2 flex items-center gap-2 text-sm pt-6">
        <input
          type="checkbox"
          checked={evidenceRequired}
          onChange={(e) => {
            setEvidenceRequired(e.target.checked);
          }}
        />
        {t("evidenceRequired")}
      </label>
      {evidenceRequired && (
        <Field htmlFor="c-mec" label={t("minEvidenceCount")}>
          <Input
            id="c-mec"
            inputMode="numeric"
            value={minEvidenceCount}
            onChange={(e) => {
              setMinEvidenceCount(e.target.value);
            }}
          />
        </Field>
      )}

      {method === "EVIDENCE_METRIC" && (
        <div className="sm:col-span-6">
          <Field htmlFor="c-mc" label={t("metricConfig")}>
            <textarea
              id="c-mc"
              value={metricConfigText}
              onChange={(e) => {
                setMetricConfigText(e.target.value);
              }}
              rows={5}
              className="w-full font-mono text-xs rounded-md border border-rule bg-surface p-2"
              placeholder='{"kind":"SERVICE_FEE_SUM","scale":{"min":0,"max":5000000,"invert":false}}'
            />
          </Field>
        </div>
      )}

      <div className="sm:col-span-6 flex items-center justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          {tc("cancel")}
        </Button>
        <Button type="submit" disabled={busy}>
          {tc("save")}
        </Button>
      </div>
    </form>
  );
}

function statusChip(s: Status, t: ReturnType<typeof useTranslations>): string {
  if (s === "DRAFT") return t("draft");
  if (s === "ACTIVE") return t("active");
  return t("retired");
}

function purposeLabel(p: Purpose, t: ReturnType<typeof useTranslations>): string {
  if (p === "CANDIDATE") return t("purposeCandidate");
  if (p === "LEVEL_REVIEW") return t("purposeLevelReview");
  return t("purposePerformance");
}

function methodLabel(m: Method, t: ReturnType<typeof useTranslations>): string {
  if (m === "AUTO_QUIZ") return t("methodAutoQuiz");
  if (m === "EVIDENCE_METRIC") return t("methodEvidenceMetric");
  return t("methodManual");
}

function mapError(err: unknown, t: ReturnType<typeof useTranslations>): string {
  if (err instanceof ApiError) {
    if (err.code === "orbita:rubric:duplicate_purpose") return t("duplicatePurpose");
    if (err.code === "orbita:rubric_version:not_draft") return t("notDraft");
    if (err.code === "orbita:rubric_version:locked") return t("lockedRefusal");
    if (err.code === "orbita:rubric_version:invalid") {
      return `${t("activationFailed")}: ${err.problem.detail ?? ""}`.trim();
    }
    if (err.code === "orbita:validation") {
      return err.problem.errors?.[0]?.message ?? err.problem.title;
    }
  }
  return err instanceof Error ? err.message : "Error";
}
