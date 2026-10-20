import type { ReactNode } from "react";

/**
 * Section header for admin pages. A short eyebrow (e.g. "Settings"), the
 * page name as display-face H1, a one-line subtitle, and an actions
 * slot on the right. Keeps every settings page starting from the same
 * baseline so the eye lands in the same place.
 */
export function PageHeader({
  eyebrow,
  title,
  subtitle,
  actions,
}: {
  readonly eyebrow?: string;
  readonly title: string;
  readonly subtitle?: string;
  readonly actions?: ReactNode;
}) {
  return (
    <header className="mb-6 flex items-start justify-between gap-6 flex-wrap">
      <div className="min-w-0">
        {eyebrow !== undefined && (
          <p className="text-xs uppercase tracking-wider text-fg-dim font-mono mb-2">{eyebrow}</p>
        )}
        <h1 className="font-display text-3xl font-semibold tracking-tight text-balance">{title}</h1>
        {subtitle !== undefined && <p className="text-fg-muted mt-1 text-sm max-w-prose">{subtitle}</p>}
      </div>
      {actions !== undefined && <div className="flex items-center gap-2">{actions}</div>}
    </header>
  );
}
