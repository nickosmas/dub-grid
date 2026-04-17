"use client";

import React from "react";
import { PREDEFINED_COLORS, getPresetByBg, PredefinedColor } from "@/lib/colors";
import { sectionStyle, labelStyle as sharedLabelStyle } from "@/lib/styles";
import { parseTo12h, to24h } from "@/lib/utils";
import CustomSelect from "@/components/CustomSelect";
import { MaybeHint } from "@/components/ui/hint";

// ── Re-exports for convenience ───────────────────────────────────────────────
export const labelStyle = sharedLabelStyle;
export const inputStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box" as const,
  height: 36,
  padding: "0 10px",
  border: "1px solid var(--color-border)",
  borderRadius: "var(--dg-btn-radius)",
  fontSize: 13,
  fontWeight: 500,
  fontFamily: "inherit",
  color: "var(--color-text-secondary)",
  background: "var(--color-surface)",
  outline: "none",
};

/** Normalize a time string to "HH:MM" for comparison (handles "HH:MM:SS" and null). */
export function normalizeTimeCompare(t: string | null | undefined): string | null {
  if (!t) return null;
  return t.slice(0, 5);
}

// ── Section card (headerless container) ─────────────────────────────────────────
export function SectionCard({
  children,
  maxWidth = 860,
  noPadding = false,
}: {
  children: React.ReactNode;
  maxWidth?: number;
  noPadding?: boolean;
}) {
  return (
    <div
      className="dg-page-enter"
      style={{
        ...sectionStyle,
        width: "100%",
        maxWidth,
        flexShrink: 0,
      }}
    >
      {noPadding ? children : <div style={{ padding: "20px" }}>{children}</div>}
    </div>
  );
}

// ── Preset Color Picker ──────────────────────────────────────────────────────
export function PresetColorPicker({ valueBg, onChange, disabled }: { valueBg: string; onChange: (c: PredefinedColor) => void; disabled?: boolean }) {
  const active = getPresetByBg(valueBg);
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
      {PREDEFINED_COLORS.map(c => (
        <MaybeHint key={c.id} content={c.name} side="top">
          <button
            type="button"
            onClick={() => !disabled && onChange(c)}
            disabled={disabled}
            aria-label={c.name}
            style={{
              width: 24,
              height: 24,
              borderRadius: "50%",
              background: c.bg,
              border: active.id === c.id ? `2px solid ${c.text}` : "1px solid var(--color-border)",
              cursor: disabled ? "not-allowed" : "pointer",
              padding: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              opacity: disabled ? 0.5 : 1,
            }}
          >
            {active.id === c.id && <span style={{ width: 8, height: 8, borderRadius: "50%", background: c.text }} />}
          </button>
        </MaybeHint>
      ))}
    </div>
  );
}

// ── 12-hour time picker ───────────────────────────────────────────────────────
export function TimeInput12h({ value, onChange, disabled }: { value: string | null | undefined; onChange: (v: string | null) => void; disabled?: boolean }) {
  const { hour, minute, period } = parseTo12h(value);

  const hourOptions = [
    { value: "", label: "--" },
    ...[1,2,3,4,5,6,7,8,9,10,11,12].map((h) => ({ value: String(h), label: String(h) })),
  ];
  const minuteOptions = ["00","05","10","15","20","25","30","35","40","45","50","55"].map((m) => ({ value: m, label: m }));
  const periodOptions = [{ value: "AM" as const, label: "AM" }, { value: "PM" as const, label: "PM" }];

  return (
    <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
      <CustomSelect
        value={hour}
        options={hourOptions}
        onChange={(val) => onChange(to24h(val, minute, period))}
        disabled={disabled}
        fontSize={13}
        style={{ width: 68 }}
      />
      <span style={{ fontWeight: 700, color: "var(--color-text-muted)" }}>:</span>
      <CustomSelect
        value={minute}
        options={minuteOptions}
        onChange={(val) => onChange(to24h(hour, val, period))}
        disabled={disabled}
        fontSize={13}
        style={{ width: 68 }}
      />
      <CustomSelect
        value={period}
        options={periodOptions}
        onChange={(val) => onChange(to24h(hour, minute, val as "AM" | "PM"))}
        disabled={disabled}
        fontSize={13}
        style={{ width: 72 }}
      />
    </div>
  );
}
