"use client";

import { useTheme } from "next-themes";

import { SectionCard } from "@/components/settings/shared";
import { Button } from "@/components/Button";
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
      <div className="flex flex-col gap-3">
        <div>
          <div className="text-[14px] font-semibold text-[var(--dg-color-text-primary)]">Theme</div>
          <p className="mb-0 mt-1 text-[13px] text-[var(--dg-color-text-muted)]">
            Follow your device's appearance, or choose light or dark. This only affects how DubGrid
            looks on this device.
          </p>
        </div>
        <div className="dg-segment flex max-w-80">
          {THEME_OPTIONS.map((option) => (
            <Button
              key={option.value}
              type="button"
              className={`dg-segment-btn flex-1${theme === option.value ? " active" : ""}`}
              onClick={() => setTheme(option.value)}
            >
              {option.label}
            </Button>
          ))}
        </div>
        <AppearancePreview />
      </div>
    </SectionCard>
  );
}
