import { useTranslations } from "next-intl";

/**
 * Monogram + wordmark. The ring is drawn in SVG so it inherits
 * `currentColor` and stays sharp at any size; a dot sits off-centre to
 * give the mark a direction without resembling a product logo we don't
 * have the rights to.
 */
export function Logo({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const t = useTranslations("brand");
  const dim = size === "sm" ? 20 : size === "lg" ? 32 : 24;
  const text = size === "sm" ? "text-base" : size === "lg" ? "text-2xl" : "text-lg";
  return (
    <div className="inline-flex items-center gap-2 text-fg">
      <svg width={dim} height={dim} viewBox="0 0 24 24" aria-hidden="true" className="text-accent">
        <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <circle cx="17.5" cy="7.3" r="2" fill="currentColor" />
      </svg>
      <span className={`font-display font-semibold tracking-tight ${text}`}>{t("name")}</span>
    </div>
  );
}
