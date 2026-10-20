import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  readonly invalid?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, invalid, type = "text", ...rest },
  ref,
) {
  return (
    <input
      ref={ref}
      type={type}
      aria-invalid={invalid ? "true" : undefined}
      className={cn(
        "h-10 w-full rounded-sm border bg-surface px-3 text-sm text-fg " +
          "placeholder:text-fg-dim focus-visible:outline-none focus-visible:ring-2 " +
          "focus-visible:ring-[color:var(--focus)] focus-visible:border-[color:var(--focus)] " +
          "disabled:cursor-not-allowed disabled:opacity-60",
        invalid === true ? "border-critical" : "border-rule-strong",
        className,
      )}
      {...rest}
    />
  );
});
