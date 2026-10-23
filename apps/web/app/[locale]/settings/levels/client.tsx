"use client";

import { ArrowDown, ArrowUp } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ApiError, apiFetch } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

export interface Level {
  readonly id: string;
  readonly key: string;
  readonly rank: number;
  readonly name: { uz: string; ru?: string; en?: string };
  readonly approval: "UNAPPROVED" | "APPROVED";
  readonly isActive: boolean;
}

/**
 * Career levels page.
 *
 * Rank order is the primary UI concern — row-level ↑/↓ buttons rewrite
 * the whole active-ranked list via the atomic `/levels/reorder` endpoint
 * so the partial unique index never breaks mid-move. Each unapproved
 * level shows a chip with an Approve action; approving an already-live
 * level is a no-op server-side.
 */
export function LevelsClient({ initialLevels }: { readonly initialLevels: readonly Level[] }) {
  const t = useTranslations("settings.levels");
  const tc = useTranslations("settings.common");
  const router = useRouter();
  const [levels, setLevels] = useState<readonly Level[]>(initialLevels);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [newNameUz, setNewNameUz] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  async function reload() {
    const data = await apiFetch<{ levels: Level[] }>("/api/v1/levels");
    setLevels(data.levels);
    router.refresh();
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await apiFetch("/api/v1/levels", {
        method: "POST",
        body: { key: newKey.trim(), name: { uz: newNameUz.trim() } },
      });
      setNewKey("");
      setNewNameUz("");
      setShowCreate(false);
      await reload();
    } catch (err) {
      setError(mapError(err, tc));
    }
  }

  async function approve(id: string) {
    setBusyId(id);
    try {
      await apiFetch(`/api/v1/levels/${id}/approve`, { method: "POST" });
      await reload();
    } catch (err) {
      setError(mapError(err, tc));
    } finally {
      setBusyId(null);
    }
  }

  async function move(id: string, direction: -1 | 1) {
    const active = levels.filter((l) => l.isActive);
    const idx = active.findIndex((l) => l.id === id);
    const target = idx + direction;
    if (idx === -1 || target < 0 || target >= active.length) return;
    const next = [...active];
    const a = next[idx];
    const b = next[target];
    if (a === undefined || b === undefined) return;
    next[idx] = b;
    next[target] = a;
    setBusyId(id);
    try {
      await apiFetch("/api/v1/levels/reorder", {
        method: "POST",
        body: { orderedIds: next.map((l) => l.id) },
      });
      await reload();
    } catch (err) {
      setError(mapError(err, tc));
    } finally {
      setBusyId(null);
    }
  }

  const active = levels.filter((l) => l.isActive);
  const inactive = levels.filter((l) => !l.isActive);

  return (
    <div className="flex flex-col gap-4">
      {error !== null && (
        <p role="alert" className="text-sm text-critical rounded-sm bg-critical-soft px-3 py-2">
          {error}
        </p>
      )}
      <div className="flex items-center justify-between">
        <p className="text-sm text-fg-muted">
          {active.length} {active.length === 1 ? "level" : "levels"}
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
          <Field htmlFor="lv-key" label={tc("key")}>
            <Input
              id="lv-key"
              value={newKey}
              onChange={(e) => {
                setNewKey(e.target.value);
              }}
              required
            />
          </Field>
          <Field htmlFor="lv-uz" label={tc("nameUz")}>
            <Input
              id="lv-uz"
              value={newNameUz}
              onChange={(e) => {
                setNewNameUz(e.target.value);
              }}
              required
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
            <Button type="submit" disabled={newKey.trim() === "" || newNameUz.trim() === ""}>
              {tc("create")}
            </Button>
          </div>
        </form>
      )}

      <ul className="divide-y divide-rule border border-rule rounded-lg bg-surface">
        {active.length === 0 && (
          <li className="px-4 py-6 text-center text-sm text-fg-muted">{tc("empty")}</li>
        )}
        {active.map((l, i) => (
          <li key={l.id} className="flex items-center gap-3 px-4 py-3">
            <span className="font-mono text-xs text-fg-dim w-8 shrink-0">#{l.rank.toString()}</span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate">{l.name.uz}</p>
              <p className="text-xs text-fg-dim font-mono truncate">{l.key}</p>
            </div>
            {l.approval === "UNAPPROVED" && (
              <span className="text-[10px] font-mono uppercase tracking-wider text-warn bg-warn-soft px-1.5 py-0.5 rounded">
                {t("unapproved")}
              </span>
            )}
            <div className="flex items-center gap-1">
              <Button
                size="sm"
                variant="ghost"
                aria-label={t("moveUp")}
                disabled={busyId !== null || i === 0}
                onClick={() => {
                  void move(l.id, -1);
                }}
              >
                <ArrowUp className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                aria-label={t("moveDown")}
                disabled={busyId !== null || i === active.length - 1}
                onClick={() => {
                  void move(l.id, 1);
                }}
              >
                <ArrowDown className="h-3.5 w-3.5" />
              </Button>
              {l.approval === "UNAPPROVED" && (
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={busyId !== null}
                  onClick={() => {
                    void approve(l.id);
                  }}
                >
                  {t("approve")}
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>

      {inactive.length > 0 && (
        <div className="rounded-lg border border-dashed border-rule p-4">
          <p className="text-xs text-fg-dim mb-2">{tc("disabled")}</p>
          <ul className="flex flex-wrap gap-2">
            {inactive.map((l) => (
              <li key={l.id} className="text-xs font-mono text-fg-muted">
                {l.key}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function mapError(err: unknown, t: ReturnType<typeof useTranslations>): string {
  if (err instanceof ApiError && err.code === "orbita:level:duplicate_key") {
    return t("duplicateKey");
  }
  if (err instanceof ApiError && err.code === "orbita:validation") {
    return err.problem.errors?.[0]?.message ?? t("invalidKey");
  }
  return err instanceof Error ? err.message : "Error";
}
