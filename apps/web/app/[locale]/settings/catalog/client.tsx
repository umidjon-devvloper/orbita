"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { ApiError, apiFetch } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

interface LocalizedText {
  uz: string;
  ru?: string;
  en?: string;
}

export interface Specialty {
  readonly id: string;
  readonly key: string;
  readonly name: LocalizedText;
  readonly isActive: boolean;
}

export interface Position {
  readonly id: string;
  readonly specialtyId: string;
  readonly key: string;
  readonly title: LocalizedText;
  readonly isActive: boolean;
}

export interface Competency {
  readonly id: string;
  readonly key: string;
  readonly name: LocalizedText;
  readonly isActive: boolean;
}

/**
 * Three stacked sections — one per catalog entity — because they share
 * the same shape (key + localized name + active flag) and users
 * typically work on all three in a single sitting. Each section
 * reloads only its own slice after a mutation so a long specialties
 * table doesn't flash on a competency create.
 */
export function CatalogClient({
  initialSpecialties,
  initialPositions,
  initialCompetencies,
}: {
  readonly initialSpecialties: readonly Specialty[];
  readonly initialPositions: readonly Position[];
  readonly initialCompetencies: readonly Competency[];
}) {
  const router = useRouter();
  const [specialties, setSpecialties] = useState<readonly Specialty[]>(initialSpecialties);
  const [positions, setPositions] = useState<readonly Position[]>(initialPositions);
  const [competencies, setCompetencies] = useState<readonly Competency[]>(initialCompetencies);

  async function refresh(path: string, apply: (data: unknown) => void): Promise<void> {
    const data = await apiFetch<unknown>(path);
    apply(data);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-10">
      <Section title={useT("catalog").s} subtitle="">
        <SpecialtyBlock
          specialties={specialties}
          onCreate={async () =>
            refresh("/api/v1/catalog/specialties", (d) => {
              setSpecialties((d as { specialties: Specialty[] }).specialties);
            })
          }
        />
      </Section>

      <Section title={useT("catalog").p} subtitle="">
        <PositionBlock
          specialties={specialties}
          positions={positions}
          onCreate={async () =>
            refresh("/api/v1/catalog/positions", (d) => {
              setPositions((d as { positions: Position[] }).positions);
            })
          }
        />
      </Section>

      <Section title={useT("catalog").c} subtitle="">
        <CompetencyBlock
          competencies={competencies}
          onCreate={async () =>
            refresh("/api/v1/catalog/competencies", (d) => {
              setCompetencies((d as { competencies: Competency[] }).competencies);
            })
          }
        />
      </Section>
    </div>
  );
}

/** Translation helper so each section labels itself without passing t() around. */
function useT(_key: string) {
  const t = useTranslations("settings.catalog");
  return {
    s: t("specialties"),
    p: t("positions"),
    c: t("competencies"),
  };
}

function Section({
  title,
  subtitle,
  children,
}: {
  readonly title: string;
  readonly subtitle: string;
  readonly children: ReactNode;
}) {
  return (
    <section>
      <h2 className="font-display text-xl font-semibold text-fg mb-3">
        {title}
        {subtitle !== "" && (
          <span className="text-sm text-fg-muted font-sans font-normal"> — {subtitle}</span>
        )}
      </h2>
      {children}
    </section>
  );
}

function SpecialtyBlock({
  specialties,
  onCreate,
}: {
  readonly specialties: readonly Specialty[];
  readonly onCreate: () => Promise<void>;
}) {
  const t = useTranslations("settings.common");
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState("");
  const [uz, setUz] = useState("");
  const [ru, setRu] = useState("");
  const [en, setEn] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiFetch("/api/v1/catalog/specialties", {
        method: "POST",
        body: {
          key: key.trim(),
          name: {
            uz: uz.trim(),
            ...(ru.trim() !== "" ? { ru: ru.trim() } : {}),
            ...(en.trim() !== "" ? { en: en.trim() } : {}),
          },
        },
      });
      setKey("");
      setUz("");
      setRu("");
      setEn("");
      setOpen(false);
      await onCreate();
    } catch (err) {
      setError(mapError(err, t));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <RowList
        rows={specialties.map((s) => ({
          id: s.id,
          head: s.name.uz,
          sub: s.key,
          isActive: s.isActive,
        }))}
      />
      {open ? (
        <form
          onSubmit={(e) => void submit(e)}
          className="rounded-lg border border-rule bg-surface p-4 grid grid-cols-1 sm:grid-cols-2 gap-3"
        >
          <Field htmlFor="sp-key" label={t("key")}>
            <Input
              id="sp-key"
              value={key}
              onChange={(e) => {
                setKey(e.target.value);
              }}
              required
            />
          </Field>
          <Field htmlFor="sp-uz" label={t("nameUz")}>
            <Input
              id="sp-uz"
              value={uz}
              onChange={(e) => {
                setUz(e.target.value);
              }}
              required
            />
          </Field>
          <Field htmlFor="sp-ru" label={t("nameRu")}>
            <Input
              id="sp-ru"
              value={ru}
              onChange={(e) => {
                setRu(e.target.value);
              }}
            />
          </Field>
          <Field htmlFor="sp-en" label={t("nameEn")}>
            <Input
              id="sp-en"
              value={en}
              onChange={(e) => {
                setEn(e.target.value);
              }}
            />
          </Field>
          {error !== null && (
            <p className="sm:col-span-2 text-sm text-critical" role="alert">
              {error}
            </p>
          )}
          <div className="sm:col-span-2 flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setOpen(false);
              }}
            >
              {t("cancel")}
            </Button>
            <Button type="submit" disabled={busy || key.trim() === "" || uz.trim() === ""}>
              {t("create")}
            </Button>
          </div>
        </form>
      ) : (
        <Button
          size="sm"
          variant="secondary"
          onClick={() => {
            setOpen(true);
          }}
          className="self-start"
        >
          + {t("add")}
        </Button>
      )}
    </div>
  );
}

function PositionBlock({
  specialties,
  positions,
  onCreate,
}: {
  readonly specialties: readonly Specialty[];
  readonly positions: readonly Position[];
  readonly onCreate: () => Promise<void>;
}) {
  const t = useTranslations("settings.common");
  const tc = useTranslations("settings.catalog");
  const [open, setOpen] = useState(false);
  const [specialtyId, setSpecialtyId] = useState(specialties[0]?.id ?? "");
  const [key, setKey] = useState("");
  const [uz, setUz] = useState("");
  const [ru, setRu] = useState("");
  const [en, setEn] = useState("");
  const [error, setError] = useState<string | null>(null);

  const specLabel = (id: string) => specialties.find((s) => s.id === id)?.name.uz ?? id;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await apiFetch("/api/v1/catalog/positions", {
        method: "POST",
        body: {
          specialtyId,
          key: key.trim(),
          title: {
            uz: uz.trim(),
            ...(ru.trim() !== "" ? { ru: ru.trim() } : {}),
            ...(en.trim() !== "" ? { en: en.trim() } : {}),
          },
        },
      });
      setKey("");
      setUz("");
      setRu("");
      setEn("");
      setOpen(false);
      await onCreate();
    } catch (err) {
      setError(mapError(err, t));
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <RowList
        rows={positions.map((p) => ({
          id: p.id,
          head: p.title.uz,
          sub: `${p.key} · ${specLabel(p.specialtyId)}`,
          isActive: p.isActive,
        }))}
      />
      {open ? (
        <form
          onSubmit={(e) => void submit(e)}
          className="rounded-lg border border-rule bg-surface p-4 grid grid-cols-1 sm:grid-cols-2 gap-3"
        >
          <Field htmlFor="po-spec" label={tc("specialty")}>
            <select
              id="po-spec"
              value={specialtyId}
              onChange={(e) => {
                setSpecialtyId(e.target.value);
              }}
              className="h-10 w-full rounded-sm border border-rule-strong bg-surface px-3 text-sm text-fg"
              required
            >
              {specialties.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name.uz}
                </option>
              ))}
            </select>
          </Field>
          <Field htmlFor="po-key" label={t("key")}>
            <Input
              id="po-key"
              value={key}
              onChange={(e) => {
                setKey(e.target.value);
              }}
              required
            />
          </Field>
          <Field htmlFor="po-uz" label={tc("title_pos")}>
            <Input
              id="po-uz"
              value={uz}
              onChange={(e) => {
                setUz(e.target.value);
              }}
              required
            />
          </Field>
          <Field htmlFor="po-ru" label={t("nameRu")}>
            <Input
              id="po-ru"
              value={ru}
              onChange={(e) => {
                setRu(e.target.value);
              }}
            />
          </Field>
          <Field htmlFor="po-en" label={t("nameEn")}>
            <Input
              id="po-en"
              value={en}
              onChange={(e) => {
                setEn(e.target.value);
              }}
            />
          </Field>
          {error !== null && (
            <p className="sm:col-span-2 text-sm text-critical" role="alert">
              {error}
            </p>
          )}
          <div className="sm:col-span-2 flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setOpen(false);
              }}
            >
              {t("cancel")}
            </Button>
            <Button type="submit" disabled={specialtyId === "" || key.trim() === "" || uz.trim() === ""}>
              {t("create")}
            </Button>
          </div>
        </form>
      ) : (
        <Button
          size="sm"
          variant="secondary"
          onClick={() => {
            setOpen(true);
          }}
          className="self-start"
          disabled={specialties.length === 0}
        >
          + {t("add")}
        </Button>
      )}
    </div>
  );
}

function CompetencyBlock({
  competencies,
  onCreate,
}: {
  readonly competencies: readonly Competency[];
  readonly onCreate: () => Promise<void>;
}) {
  const t = useTranslations("settings.common");
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState("");
  const [uz, setUz] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await apiFetch("/api/v1/catalog/competencies", {
        method: "POST",
        body: { key: key.trim(), name: { uz: uz.trim() } },
      });
      setKey("");
      setUz("");
      setOpen(false);
      await onCreate();
    } catch (err) {
      setError(mapError(err, t));
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <RowList
        rows={competencies.map((c) => ({ id: c.id, head: c.name.uz, sub: c.key, isActive: c.isActive }))}
      />
      {open ? (
        <form
          onSubmit={(e) => void submit(e)}
          className="rounded-lg border border-rule bg-surface p-4 grid grid-cols-1 sm:grid-cols-2 gap-3"
        >
          <Field htmlFor="co-key" label={t("key")}>
            <Input
              id="co-key"
              value={key}
              onChange={(e) => {
                setKey(e.target.value);
              }}
              required
            />
          </Field>
          <Field htmlFor="co-uz" label={t("nameUz")}>
            <Input
              id="co-uz"
              value={uz}
              onChange={(e) => {
                setUz(e.target.value);
              }}
              required
            />
          </Field>
          {error !== null && (
            <p className="sm:col-span-2 text-sm text-critical" role="alert">
              {error}
            </p>
          )}
          <div className="sm:col-span-2 flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setOpen(false);
              }}
            >
              {t("cancel")}
            </Button>
            <Button type="submit" disabled={key.trim() === "" || uz.trim() === ""}>
              {t("create")}
            </Button>
          </div>
        </form>
      ) : (
        <Button
          size="sm"
          variant="secondary"
          onClick={() => {
            setOpen(true);
          }}
          className="self-start"
        >
          + {t("add")}
        </Button>
      )}
    </div>
  );
}

function RowList({
  rows,
}: {
  readonly rows: readonly { id: string; head: string; sub: string; isActive: boolean }[];
}) {
  const t = useTranslations("settings.common");
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-rule p-6 text-center text-sm text-fg-muted">
        {t("empty")}
      </div>
    );
  }
  return (
    <ul className="divide-y divide-rule border border-rule rounded-lg bg-surface">
      {rows.map((r) => (
        <li key={r.id} className="flex items-center justify-between px-4 py-3">
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">{r.head}</p>
            <p className="text-xs text-fg-dim font-mono truncate">{r.sub}</p>
          </div>
          {!r.isActive && (
            <span className="text-[10px] font-mono uppercase tracking-wider text-fg-dim">
              {t("disabled")}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

function mapError(err: unknown, t: ReturnType<typeof useTranslations>): string {
  if (err instanceof ApiError) {
    switch (err.code) {
      case "orbita:catalog:duplicate_key":
        return t("duplicateKey");
      case "orbita:validation":
        return err.problem.errors?.[0]?.message ?? t("invalidKey");
    }
  }
  return err instanceof Error ? err.message : "Error";
}
