"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { ApiError, apiFetch } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { Position } from "../catalog/client";
import type { Level } from "../levels/client";

export interface SalaryBand {
  readonly id: string;
  readonly positionId: string;
  readonly levelId: string;
  readonly minAmount: string;
  readonly maxAmount: string;
  readonly currency: string;
  readonly effectiveFrom: string;
  readonly effectiveTo: string | null;
  readonly approval: "UNAPPROVED" | "APPROVED";
}

/**
 * Salary band editor.
 *
 * Grouped under position because a band isn't meaningful without one, and
 * the mental model is "what does this role pay at each level?". Within a
 * group, bands sort by effective-from desc so the most recent — the one
 * the admin almost always wants to extend or close — is on top.
 */
export function SalaryClient({
  initialBands,
  positions,
  levels,
  locale,
}: {
  readonly initialBands: readonly SalaryBand[];
  readonly positions: readonly Position[];
  readonly levels: readonly Level[];
  readonly locale: string;
}) {
  const t = useTranslations("settings.salary");
  const tc = useTranslations("settings.common");
  const router = useRouter();
  const [bands, setBands] = useState<readonly SalaryBand[]>(initialBands);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [positionId, setPositionId] = useState(positions[0]?.id ?? "");
  const [levelId, setLevelId] = useState(levels[0]?.id ?? "");
  const [minAmount, setMinAmount] = useState("");
  const [maxAmount, setMaxAmount] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState(todayIso());
  const [effectiveTo, setEffectiveTo] = useState("");

  const levelById = useMemo(() => new Map(levels.map((l) => [l.id, l] as const)), [levels]);

  const grouped = useMemo(() => {
    const map = new Map<string, SalaryBand[]>();
    for (const b of bands) {
      const list = map.get(b.positionId) ?? [];
      list.push(b);
      map.set(b.positionId, list);
    }
    return map;
  }, [bands]);

  async function reload() {
    const data = await apiFetch<{ bands: SalaryBand[] }>("/api/v1/salary-bands");
    setBands(data.bands);
    router.refresh();
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await apiFetch("/api/v1/salary-bands", {
        method: "POST",
        body: {
          positionId,
          levelId,
          minAmount: minAmount.replace(/\s/g, ""),
          maxAmount: maxAmount.replace(/\s/g, ""),
          effectiveFrom,
          effectiveTo: effectiveTo.trim() === "" ? null : effectiveTo,
        },
      });
      setMinAmount("");
      setMaxAmount("");
      setEffectiveTo("");
      setShowCreate(false);
      await reload();
    } catch (err) {
      setError(mapError(err, t, tc));
    }
  }

  async function approve(id: string) {
    setBusyId(id);
    try {
      await apiFetch(`/api/v1/salary-bands/${id}/approve`, { method: "POST" });
      await reload();
    } catch (err) {
      setError(mapError(err, t, tc));
    } finally {
      setBusyId(null);
    }
  }

  async function close(id: string) {
    const ans = window.prompt(t("effectiveTo"), todayIso());
    if (ans === null || ans.trim() === "") return;
    setBusyId(id);
    try {
      await apiFetch(`/api/v1/salary-bands/${id}/close`, {
        method: "POST",
        body: { effectiveTo: ans.trim() },
      });
      await reload();
    } catch (err) {
      setError(mapError(err, t, tc));
    } finally {
      setBusyId(null);
    }
  }

  if (positions.length === 0 || levels.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-rule p-6 text-sm text-fg-muted">
        {locale === "ru"
          ? "Сначала создайте должности и уровни в разделе каталога и уровней."
          : locale === "en"
            ? "Create positions and levels first in Catalog and Career levels."
            : "Avval Katalog va Darajalar bo'limida lavozim va daraja yarating."}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {error !== null && (
        <p role="alert" className="text-sm text-critical rounded-sm bg-critical-soft px-3 py-2">
          {error}
        </p>
      )}
      <div className="flex items-center justify-between">
        <p className="text-sm text-fg-muted">
          {bands.length} {bands.length === 1 ? "band" : "bands"}
        </p>
        <Button
          size="sm"
          onClick={() => {
            setShowCreate(true);
          }}
        >
          + {tc("add")}
        </Button>
      </div>

      {showCreate && (
        <form
          onSubmit={(e) => void create(e)}
          className="rounded-lg border border-rule bg-surface p-4 grid grid-cols-1 sm:grid-cols-2 gap-3"
        >
          <Field htmlFor="sb-pos" label={t("position")}>
            <select
              id="sb-pos"
              value={positionId}
              onChange={(e) => {
                setPositionId(e.target.value);
              }}
              className="h-9 rounded-md border border-rule bg-surface px-2 text-sm"
              required
            >
              {positions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title[locale as "uz" | "ru" | "en"] ?? p.title.uz}
                </option>
              ))}
            </select>
          </Field>
          <Field htmlFor="sb-lvl" label={t("level")}>
            <select
              id="sb-lvl"
              value={levelId}
              onChange={(e) => {
                setLevelId(e.target.value);
              }}
              className="h-9 rounded-md border border-rule bg-surface px-2 text-sm"
              required
            >
              {levels.map((l) => (
                <option key={l.id} value={l.id}>
                  #{l.rank.toString()} · {l.name[locale as "uz" | "ru" | "en"] ?? l.name.uz}
                </option>
              ))}
            </select>
          </Field>
          <Field htmlFor="sb-min" label={t("minAmount")}>
            <Input
              id="sb-min"
              inputMode="numeric"
              pattern="[0-9 ]+"
              value={minAmount}
              onChange={(e) => {
                setMinAmount(e.target.value);
              }}
              required
            />
          </Field>
          <Field htmlFor="sb-max" label={t("maxAmount")}>
            <Input
              id="sb-max"
              inputMode="numeric"
              pattern="[0-9 ]+"
              value={maxAmount}
              onChange={(e) => {
                setMaxAmount(e.target.value);
              }}
              required
            />
          </Field>
          <Field htmlFor="sb-from" label={t("effectiveFrom")}>
            <Input
              id="sb-from"
              type="date"
              value={effectiveFrom}
              onChange={(e) => {
                setEffectiveFrom(e.target.value);
              }}
              required
            />
          </Field>
          <Field htmlFor="sb-to" label={t("effectiveTo")}>
            <Input
              id="sb-to"
              type="date"
              value={effectiveTo}
              onChange={(e) => {
                setEffectiveTo(e.target.value);
              }}
            />
          </Field>
          <div className="sm:col-span-2 flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setShowCreate(false);
              }}
            >
              {tc("cancel")}
            </Button>
            <Button type="submit">{tc("create")}</Button>
          </div>
        </form>
      )}

      <div className="flex flex-col gap-4">
        {grouped.size === 0 && (
          <p className="text-sm text-fg-muted px-4 py-6 border border-rule rounded-lg bg-surface text-center">
            {tc("empty")}
          </p>
        )}
        {positions.map((p) => {
          const list = grouped.get(p.id);
          if (list === undefined || list.length === 0) return null;
          const title = p.title[locale as "uz" | "ru" | "en"] ?? p.title.uz;
          return (
            <section key={p.id} className="rounded-lg border border-rule bg-surface">
              <header className="px-4 py-2 border-b border-rule">
                <h2 className="text-sm font-semibold">{title}</h2>
              </header>
              <ul className="divide-y divide-rule">
                {list.map((b) => {
                  const l = levelById.get(b.levelId);
                  const levelLabel = l
                    ? `#${l.rank.toString()} ${l.name[locale as "uz" | "ru" | "en"] ?? l.name.uz}`
                    : b.levelId.slice(0, 8);
                  return (
                    <li key={b.id} className="grid grid-cols-[1fr_auto_auto] gap-3 px-4 py-3 items-center">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{levelLabel}</p>
                        <p className="text-xs text-fg-dim">
                          {b.effectiveFrom} → {b.effectiveTo ?? "∞"}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-mono tabular-nums">
                          {formatUzs(b.minAmount)} – {formatUzs(b.maxAmount)}
                        </p>
                        <p className="text-xs text-fg-dim">{b.currency}</p>
                      </div>
                      <div className="flex items-center gap-1">
                        {b.approval === "UNAPPROVED" && (
                          <span className="text-[10px] font-mono uppercase tracking-wider text-warn bg-warn-soft px-1.5 py-0.5 rounded">
                            {t("unapproved")}
                          </span>
                        )}
                        {b.approval === "UNAPPROVED" && (
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={busyId !== null}
                            onClick={() => {
                              void approve(b.id);
                            }}
                          >
                            {t("approve")}
                          </Button>
                        )}
                        {b.effectiveTo === null && (
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={busyId !== null}
                            onClick={() => {
                              void close(b.id);
                            }}
                          >
                            {t("close")}
                          </Button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function todayIso(): string {
  const d = new Date();
  return `${d.getUTCFullYear().toString().padStart(4, "0")}-${(d.getUTCMonth() + 1).toString().padStart(2, "0")}-${d.getUTCDate().toString().padStart(2, "0")}`;
}

function formatUzs(amount: string): string {
  const n = Number.parseInt(amount, 10);
  if (!Number.isFinite(n)) return amount;
  return n.toLocaleString("ru-RU").replace(/,/g, " ");
}

function mapError(
  err: unknown,
  t: ReturnType<typeof useTranslations>,
  tc: ReturnType<typeof useTranslations>,
): string {
  if (err instanceof ApiError) {
    if (err.code === "orbita:salary_band:overlap") return t("overlap");
    if (err.code === "orbita:validation") {
      return err.problem.errors?.[0]?.message ?? tc("invalidKey");
    }
  }
  return err instanceof Error ? err.message : "Error";
}
