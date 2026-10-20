"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ApiError, apiFetch } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

export interface OrgUnit {
  readonly id: string;
  readonly orgId: string;
  readonly parentId: string | null;
  readonly name: string;
  readonly path: string;
}

interface TreeNode extends OrgUnit {
  readonly depth: number;
}

/**
 * Build a flat, depth-annotated list in path order so we can render the
 * tree with simple left-padding instead of a nested JSX walker.
 */
function flatten(units: readonly OrgUnit[]): TreeNode[] {
  const sorted = [...units].sort((a, b) => a.path.localeCompare(b.path));
  return sorted.map((u) => {
    // Depth is the number of ids inside the materialized path. The path
    // always ends with "/" so we count non-empty segments.
    const depth = u.path.split("/").filter(Boolean).length - 1;
    return { ...u, depth };
  });
}

export function OrgUnitsClient({ initialUnits }: { readonly initialUnits: readonly OrgUnit[] }) {
  const t = useTranslations("settings.orgUnits");
  const router = useRouter();
  const [units, setUnits] = useState<readonly OrgUnit[]>(initialUnits);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  async function reload() {
    const data = await apiFetch<{ units: OrgUnit[] }>("/api/v1/org-units");
    setUnits(data.units);
    router.refresh();
  }

  async function handle<T>(fn: () => Promise<T>, markId: string | null = null): Promise<T | undefined> {
    setError(null);
    setBusyId(markId);
    try {
      return await fn();
    } catch (err) {
      setError(mapError(err, t));
      return undefined;
    } finally {
      setBusyId(null);
    }
  }

  const nodes = flatten(units);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-fg-muted">
          {nodes.length === 0
            ? t("empty")
            : `${nodes.length.toString()} ${nodes.length === 1 ? "unit" : "units"}`}
        </p>
        <Button
          size="sm"
          onClick={() => {
            setShowCreate(true);
          }}
        >
          {t("newUnit")}
        </Button>
      </div>
      {error !== null && (
        <p role="alert" className="text-sm text-critical rounded-sm bg-critical-soft px-3 py-2">
          {error}
        </p>
      )}
      {showCreate && (
        <CreateForm
          units={units}
          onCancel={() => {
            setShowCreate(false);
          }}
          onCreated={async () => {
            setShowCreate(false);
            await reload();
          }}
        />
      )}
      {nodes.length > 0 && (
        <ul className="divide-y divide-rule border border-rule rounded-lg bg-surface">
          {nodes.map((n) => (
            <li key={n.id} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1" style={{ paddingLeft: `${n.depth.toString()}rem` }}>
                <p className="text-sm font-medium truncate">{n.name}</p>
                <p className="text-xs text-fg-dim font-mono truncate">{n.path}</p>
              </div>
              <div className="flex items-center gap-2">
                <RenameButton unit={n} busy={busyId === n.id} onDone={reload} setError={setError} t={t} />
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busyId === n.id}
                  onClick={() => {
                    void handle(async () => {
                      if (!window.confirm(t("deleteConfirm"))) return;
                      await apiFetch(`/api/v1/org-units/${n.id}`, { method: "DELETE" });
                      await reload();
                    }, n.id);
                  }}
                >
                  {t("delete")}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CreateForm({
  units,
  onCancel,
  onCreated,
}: {
  readonly units: readonly OrgUnit[];
  readonly onCancel: () => void;
  readonly onCreated: () => Promise<void>;
}) {
  const t = useTranslations("settings.orgUnits");
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await apiFetch("/api/v1/org-units", {
        method: "POST",
        body: { parentId: parentId === "" ? null : parentId, name: name.trim() },
      });
      await onCreated();
    } catch (err) {
      setError(mapError(err, t));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={(e) => void submit(e)}
      className="rounded-lg border border-rule bg-surface p-4 flex flex-col gap-3"
    >
      <Field htmlFor="ou-name" label={t("name")}>
        <Input
          id="ou-name"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
          }}
          required
        />
      </Field>
      <Field htmlFor="ou-parent" label={t("parent")}>
        <select
          id="ou-parent"
          value={parentId}
          onChange={(e) => {
            setParentId(e.target.value);
          }}
          className="h-10 w-full rounded-sm border border-rule-strong bg-surface px-3 text-sm text-fg"
        >
          <option value="">{t("rootOption")}</option>
          {units.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
      </Field>
      {error !== null && (
        <p role="alert" className="text-sm text-critical">
          {error}
        </p>
      )}
      <div className="flex items-center justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          {t("cancel")}
        </Button>
        <Button type="submit" disabled={submitting || name.trim().length === 0}>
          {t("create")}
        </Button>
      </div>
    </form>
  );
}

function RenameButton({
  unit,
  busy,
  onDone,
  setError,
  t,
}: {
  readonly unit: OrgUnit;
  readonly busy: boolean;
  readonly onDone: () => Promise<void>;
  readonly setError: (v: string | null) => void;
  readonly t: ReturnType<typeof useTranslations>;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(unit.name);
  async function save() {
    try {
      await apiFetch(`/api/v1/org-units/${unit.id}`, {
        method: "PATCH",
        body: { name: name.trim() },
      });
      setEditing(false);
      await onDone();
    } catch (err) {
      setError(mapError(err, t));
    }
  }
  if (!editing) {
    return (
      <Button
        size="sm"
        variant="secondary"
        disabled={busy}
        onClick={() => {
          setName(unit.name);
          setEditing(true);
        }}
      >
        {t("rename")}
      </Button>
    );
  }
  return (
    <div className="flex items-center gap-1">
      <Input
        value={name}
        onChange={(e) => {
          setName(e.target.value);
        }}
        className="h-8 w-40"
      />
      <Button
        size="sm"
        onClick={() => {
          void save();
        }}
        disabled={name.trim().length === 0 || name === unit.name}
      >
        {t("rename")}
      </Button>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => {
          setEditing(false);
        }}
      >
        {t("cancel")}
      </Button>
    </div>
  );
}

function mapError(err: unknown, t: ReturnType<typeof useTranslations>): string {
  if (err instanceof ApiError) {
    switch (err.code) {
      case "orbita:org_unit:not_empty":
        return t("notEmpty");
      case "orbita:org_unit:cycle":
      case "orbita:org_unit:self_parent":
        return t("cycle");
    }
  }
  return err instanceof Error ? err.message : "Error";
}
