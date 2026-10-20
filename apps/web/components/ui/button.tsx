import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly variant?: Variant;
  readonly size?: Size;
}

const base =
  "inline-flex items-center justify-center gap-2 font-medium rounded-sm transition-colors " +
  "disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none";

const variants: Record<Variant, string> = {
  primary: "bg-accent text-accent-fg hover:bg-accent/90 active:bg-accent/80 " + "border border-transparent",
  secondary:
    "bg-surface text-fg border border-rule-strong hover:bg-surface-sunken " + "active:bg-surface-sunken/70",
  ghost: "bg-transparent text-fg-muted hover:text-fg hover:bg-surface-sunken " + "border border-transparent",
  danger: "bg-critical text-white hover:bg-critical/90 active:bg-critical/80 " + "border border-transparent",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-sm",
  md: "h-10 px-4 text-sm",
  lg: "h-11 px-5 text-base",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = "primary", size = "md", type = "button", ...rest },
  ref,
) {
  return (
    <button ref={ref} type={type} className={cn(base, variants[variant], sizes[size], className)} {...rest} />
  );
});
