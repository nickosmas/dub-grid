"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Monitor, Moon, Sun } from "lucide-react";

/**
 * Cycles light → dark → system. The third stop matters: a two-state toggle
 * can only ever write an explicit light/dark, so once a visitor touched it
 * they were stranded off "System" with no way back from this page — and,
 * because the landing page and the org subdomain are separate origins, that
 * stranded preference is what made the theme appear to flip on sign-in.
 *
 * Keyed off `theme` (the stored preference) rather than `resolvedTheme` (what
 * it currently renders as) — otherwise "System" is invisible here, since it
 * always resolves to one of the other two.
 */
const THEME_CYCLE = [
  { value: "light", Icon: Sun, label: "Theme: light. Switch to dark mode." },
  { value: "dark", Icon: Moon, label: "Theme: dark. Follow system setting." },
  { value: "system", Icon: Monitor, label: "Theme: system. Switch to light mode." },
] as const;

export default function ThemeToggleButton({ className = "" }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  // An unrecognised or not-yet-resolved theme falls back to the first entry so
  // the button always has a defined next step.
  const index = Math.max(
    0,
    THEME_CYCLE.findIndex((entry) => entry.value === theme),
  );
  const current = THEME_CYCLE[index]!;
  const next = THEME_CYCLE[(index + 1) % THEME_CYCLE.length]!;
  const Icon = current.Icon;

  return (
    <button
      type="button"
      onClick={() => setTheme(next.value)}
      className={`p-2 text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] transition-colors ${className}`}
      aria-label={current.label}
    >
      {!mounted ? <span style={{ display: "block", width: 20, height: 20 }} /> : <Icon size={20} />}
    </button>
  );
}
