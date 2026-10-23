import type { ReactNode } from "react";

/**
 * Honest empty state for a page whose API is ready but the UI slice has
 * not landed yet. We never show fake rows or placeholder metrics —
 * CLAUDE.md forbids presenting demo data as real.
 */
export function EmptyState({
  title,
  description,
  children,
}: {
  readonly title: string;
  readonly description: string;
  readonly children?: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-rule bg-surface p-10 text-center">
      <p className="font-display text-xl font-semibold text-fg">{title}</p>
      <p className="text-sm text-fg-muted mt-2 max-w-prose mx-auto">{description}</p>
      {children !== undefined && <div className="mt-6">{children}</div>}
    </div>
  );
}
