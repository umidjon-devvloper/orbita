"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ApiError, apiFetch } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

export interface UserRow {
  readonly id: string;
  readonly email: string;
  readonly status: string;
  readonly locale: string;
  readonly createdAt: string;
  readonly lastLoginAt: string | null;
  readonly roles: readonly {
    assignmentId: string;
    roleKey: string;
    orgUnitId: string | null;
    orgUnitPath: string | null;
  }[];
}

export interface Role {
  readonly id: string;
  readonly key: string;
  readonly name: { uz?: string; ru?: string; en?: string };
  readonly isSystem: boolean;
  readonly permissions: readonly { permission: string; scope: string }[];
}

export interface OrgUnit {
  readonly id: string;
  readonly name: string;
  readonly path: string;
}

/**
 * Users admin table + inline role picker. Deliberately dense: real admin
 * flows live in a tight table rather than nested cards, and this page is
 * the only one with the role-assignment surface so it keeps everything
 * inline instead of hopping between dialogs.
 */
export function UsersClient({
  initialUsers,
  roles,
  units,
  myUserId,
}: {
  readonly initialUsers: readonly UserRow[];
  readonly roles: readonly Role[];
  readonly units: readonly OrgUnit[];
  readonly myUserId: string;
}) {
  const t = useTranslations("settings.users");
  const router = useRouter();
  const [users, setUsers] = useState<readonly UserRow[]>(initialUsers);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  async function reload() {
    const data = await apiFetch<{ users: UserRow[] }>("/api/v1/users");
    setUsers(data.users);
    router.refresh();
  }

  async function toggleStatus(u: UserRow) {
    setError(null);
    try {
      await apiFetch(`/api/v1/users/${u.id}/status`, {
        method: "PATCH",
        body: { status: u.status === "ACTIVE" ? "DISABLED" : "ACTIVE" },
      });
      await reload();
    } catch (err) {
      setError(mapError(err, t));
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-fg-muted">
          {users.length} {users.length === 1 ? "user" : "users"}
        </p>
        <Button
          size="sm"
          onClick={() => {
            setShowCreate(true);
          }}
        >
          {t("newUser")}
        </Button>
      </div>
      {error !== null && (
        <p role="alert" className="text-sm text-critical rounded-sm bg-critical-soft px-3 py-2">
          {error}
        </p>
      )}
      {showCreate && (
        <CreateForm
          onCancel={() => {
            setShowCreate(false);
          }}
          onCreated={async () => {
            setShowCreate(false);
            await reload();
          }}
          setError={setError}
        />
      )}
      <div className="overflow-x-auto rounded-lg border border-rule bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left border-b border-rule text-xs uppercase tracking-wider text-fg-dim">
              <th className="px-4 py-3 font-medium">{t("email")}</th>
              <th className="px-4 py-3 font-medium">{t("status")}</th>
              <th className="px-4 py-3 font-medium">{t("roles")}</th>
              <th className="px-4 py-3 font-medium">{t("lastLogin")}</th>
              <th className="px-4 py-3 font-medium text-right">{t("actions")}</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <UserRowView
                key={u.id}
                user={u}
                roles={roles}
                units={units}
                isSelf={u.id === myUserId}
                onToggleStatus={() => void toggleStatus(u)}
                onChanged={reload}
                setError={setError}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function UserRowView({
  user,
  roles,
  units,
  isSelf,
  onToggleStatus,
  onChanged,
  setError,
}: {
  readonly user: UserRow;
  readonly roles: readonly Role[];
  readonly units: readonly OrgUnit[];
  readonly isSelf: boolean;
  readonly onToggleStatus: () => void;
  readonly onChanged: () => Promise<void>;
  readonly setError: (v: string | null) => void;
}) {
  const t = useTranslations("settings.users");
  const [showAssign, setShowAssign] = useState(false);
  return (
    <tr className="border-b border-rule last:border-0 align-top">
      <td className="px-4 py-3 font-medium">{user.email}</td>
      <td className="px-4 py-3">
        <span
          className={
            user.status === "ACTIVE"
              ? "inline-flex items-center gap-1.5 rounded-full bg-good-soft text-good px-2 py-0.5 text-xs"
              : "inline-flex items-center gap-1.5 rounded-full bg-wait text-fg-muted px-2 py-0.5 text-xs"
          }
        >
          <span
            aria-hidden
            className={
              user.status === "ACTIVE"
                ? "h-1.5 w-1.5 rounded-full bg-good"
                : "h-1.5 w-1.5 rounded-full bg-fg-dim"
            }
          />
          {user.status}
        </span>
      </td>
      <td className="px-4 py-3">
        <div className="flex flex-col gap-1">
          {user.roles.length === 0 ? (
            <span className="text-fg-dim text-xs">—</span>
          ) : (
            user.roles.map((r) => (
              <RoleChip
                key={r.assignmentId}
                role={r}
                isSelf={isSelf}
                onChanged={onChanged}
                setError={setError}
              />
            ))
          )}
          {showAssign ? (
            <AssignRoleForm
              userId={user.id}
              roles={roles}
              units={units}
              onCancel={() => {
                setShowAssign(false);
              }}
              onDone={async () => {
                setShowAssign(false);
                await onChanged();
              }}
              setError={setError}
            />
          ) : (
            <button
              type="button"
              className="text-xs text-accent hover:underline underline-offset-4 self-start mt-1"
              onClick={() => {
                setShowAssign(true);
              }}
            >
              + {t("assignRole")}
            </button>
          )}
        </div>
      </td>
      <td className="px-4 py-3 text-fg-muted text-xs">
        {user.lastLoginAt !== null ? new Date(user.lastLoginAt).toLocaleString() : "—"}
      </td>
      <td className="px-4 py-3 text-right">
        <Button
          size="sm"
          variant={user.status === "ACTIVE" ? "secondary" : "primary"}
          disabled={isSelf}
          onClick={onToggleStatus}
        >
          {user.status === "ACTIVE" ? t("disable") : t("enable")}
        </Button>
      </td>
    </tr>
  );
}

function RoleChip({
  role,
  isSelf,
  onChanged,
  setError,
}: {
  readonly role: UserRow["roles"][number];
  readonly isSelf: boolean;
  readonly onChanged: () => Promise<void>;
  readonly setError: (v: string | null) => void;
}) {
  const t = useTranslations("settings.users");
  async function revoke() {
    try {
      await apiFetch(`/api/v1/users/role-assignments/${role.assignmentId}`, { method: "DELETE" });
      await onChanged();
    } catch (err) {
      setError(mapError(err, t));
    }
  }
  const label = role.orgUnitPath !== null ? `${role.roleKey} · ${role.orgUnitPath}` : role.roleKey;
  return (
    <span className="inline-flex items-center gap-1 rounded-sm border border-rule bg-surface-sunken px-2 py-0.5 text-xs text-fg">
      <span className="font-mono">{label}</span>
      {!isSelf && (
        <button
          type="button"
          className="text-fg-dim hover:text-critical"
          aria-label={t("revoke")}
          onClick={() => void revoke()}
        >
          ×
        </button>
      )}
    </span>
  );
}

function AssignRoleForm({
  userId,
  roles,
  units,
  onCancel,
  onDone,
  setError,
}: {
  readonly userId: string;
  readonly roles: readonly Role[];
  readonly units: readonly OrgUnit[];
  readonly onCancel: () => void;
  readonly onDone: () => Promise<void>;
  readonly setError: (v: string | null) => void;
}) {
  const t = useTranslations("settings.users");
  const [roleId, setRoleId] = useState<string>(roles[0]?.id ?? "");
  const [orgUnitId, setOrgUnitId] = useState<string>("");
  const selectedRole = roles.find((r) => r.id === roleId);
  const needsUnit = selectedRole?.permissions.some((p) => p.scope === "ORG_UNIT") ?? false;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await apiFetch("/api/v1/users/role-assignments", {
        method: "POST",
        body: {
          userId,
          roleId,
          orgUnitId: needsUnit ? orgUnitId : null,
        },
      });
      await onDone();
    } catch (err) {
      setError(mapError(err, t));
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="flex flex-wrap items-end gap-2 pt-2">
      <div className="flex flex-col gap-1">
        <label className="text-xs text-fg-dim">{t("role")}</label>
        <select
          value={roleId}
          onChange={(e) => {
            setRoleId(e.target.value);
          }}
          className="h-8 rounded-sm border border-rule-strong bg-surface px-2 text-sm"
        >
          {roles.map((r) => (
            <option key={r.id} value={r.id}>
              {r.key}
            </option>
          ))}
        </select>
      </div>
      {needsUnit && (
        <div className="flex flex-col gap-1">
          <label className="text-xs text-fg-dim">{t("orgUnit")}</label>
          <select
            value={orgUnitId}
            onChange={(e) => {
              setOrgUnitId(e.target.value);
            }}
            required
            className="h-8 rounded-sm border border-rule-strong bg-surface px-2 text-sm"
          >
            <option value="">—</option>
            {units.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </div>
      )}
      <Button size="sm" type="submit" disabled={roleId === "" || (needsUnit && orgUnitId === "")}>
        {t("grant")}
      </Button>
      <Button size="sm" variant="ghost" type="button" onClick={onCancel}>
        {t("cancel")}
      </Button>
    </form>
  );
}

function CreateForm({
  onCancel,
  onCreated,
  setError,
}: {
  readonly onCancel: () => void;
  readonly onCreated: () => Promise<void>;
  readonly setError: (v: string | null) => void;
}) {
  const t = useTranslations("settings.users");
  const [email, setEmail] = useState("");
  const [locale, setLocale] = useState<"uz" | "ru" | "en">("uz");
  const [submitting, setSubmitting] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await apiFetch("/api/v1/users", {
        method: "POST",
        body: { email: email.trim().toLowerCase(), locale },
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
      className="rounded-lg border border-rule bg-surface p-4 flex flex-wrap items-end gap-3"
    >
      <Field htmlFor="new-email" label={t("email")}>
        <Input
          id="new-email"
          type="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
          }}
          required
          className="w-72"
        />
      </Field>
      <div className="flex flex-col gap-1">
        <label htmlFor="new-locale" className="text-sm font-medium text-fg">
          {t("locale")}
        </label>
        <select
          id="new-locale"
          value={locale}
          onChange={(e) => {
            setLocale(e.target.value as "uz" | "ru" | "en");
          }}
          className="h-10 rounded-sm border border-rule-strong bg-surface px-3 text-sm"
        >
          <option value="uz">O&apos;zbekcha</option>
          <option value="ru">Русский</option>
          <option value="en">English</option>
        </select>
      </div>
      <Button type="submit" disabled={submitting || email.trim().length === 0}>
        {t("invite")}
      </Button>
      <Button type="button" variant="ghost" onClick={onCancel}>
        {t("cancel")}
      </Button>
    </form>
  );
}

function mapError(err: unknown, t: ReturnType<typeof useTranslations>): string {
  if (err instanceof ApiError) {
    switch (err.code) {
      case "orbita:user:duplicate_email":
        return t("duplicateEmail");
      case "orbita:user:cannot_change_self_status":
        return t("cannotSelfDisable");
      case "orbita:role_assignment:cannot_revoke_last_self":
        return t("cannotRevokeLast");
      case "orbita:validation":
        return err.problem.errors?.[0]?.message ?? t("needsOrgUnit");
    }
  }
  return err instanceof Error ? err.message : "Error";
}
