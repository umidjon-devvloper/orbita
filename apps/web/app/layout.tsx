import type { Metadata } from "next";
import { Fraunces, Inter, JetBrains_Mono } from "next/font/google";
import type { ReactNode } from "react";
import { ThemeProvider } from "@/components/theme-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Orbita", template: "%s — Orbita" },
  description: "Employee assessment, career leveling and rewards for an online services center.",
};

const fontSans = Inter({ subsets: ["latin", "cyrillic", "latin-ext"], variable: "--font-sans" });
const fontDisplay = Fraunces({ subsets: ["latin", "latin-ext"], variable: "--font-display" });
const fontMono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono" });

/**
 * Root document shell. Sets `<html lang="uz">` as a safe default — the
 * locale layout updates it live via a tiny client component so the real
 * language sticks after hydration. Fonts and the theme provider live here
 * so pre-locale pages (not-found, errors) still render with the same
 * tokens and avoid a flash of unstyled text.
 */
export default function RootLayout({ children }: { readonly children: ReactNode }) {
  return (
    <html
      lang="uz"
      suppressHydrationWarning
      className={`${fontSans.variable} ${fontDisplay.variable} ${fontMono.variable}`}
    >
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
