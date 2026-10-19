import type { ReactNode } from "react";
import { Label } from "./label";

export interface FieldProps {
  readonly htmlFor: string;
  readonly label: string;
  readonly error?: string | undefined;
  readonly hint?: string | undefined;
  readonly children: ReactNode;
}

/**
 * Form field wrapper. Attaches the label to the control, prints a hint
 * below it, and promotes any validation error to `role="alert"` so a
 * screen reader announces it on submit. Keep validation messages short
 * and in the active voice.
 */
export function Field({ htmlFor, label, error, hint, children }: FieldProps) {
  const hintId = hint !== undefined ? `${htmlFor}-hint` : undefined;
  const errorId = error !== undefined ? `${htmlFor}-error` : undefined;
  const describedBy = [hintId, errorId].filter((v): v is string => v !== undefined).join(" ");
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      <div aria-describedby={describedBy.length > 0 ? describedBy : undefined}>{children}</div>
      {hint !== undefined && (
        <p id={hintId} className="text-xs text-fg-dim">
          {hint}
        </p>
      )}
      {error !== undefined && (
        <p id={errorId} role="alert" className="text-xs text-critical">
          {error}
        </p>
      )}
    </div>
  );
}
