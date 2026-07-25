"use client";

import { useTheme } from "next-themes";

import { SectionCard } from "@/components/settings/shared";
import { AppearancePreview } from "./AppearancePreview";

const THEME_OPTIONS = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
] as const;

export function AppearancePanel() {
  const { theme, setTheme } = useTheme();

  return (
    <SectionCard>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div>
          <div className="text-[14px] font-semibold text-[var(--color-text-primary)]">Theme</div>
          <p className="mb-0 mt-1 text-[13px] text-[var(--color-text-muted)]">
            Follow your device's appearance, or choose light or dark. This only affects how DubGrid
            looks on this device.
          </p>
        </div>
        <div className="dg-segment" style={{ display: "flex", maxWidth: 320 }}>
          {THEME_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={`dg-segment-btn${theme === option.value ? " active" : ""}`}
              style={{ flex: 1 }}
              onClick={() => setTheme(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
        <AppearancePreview />
      </div>
    </SectionCard>
  );
}
