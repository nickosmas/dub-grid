"use client";

import React from "react";
import { PREDEFINED_COLORS, getPresetByBg, PredefinedColor } from "@/lib/colors";
import { sectionStyle, sectionHeaderStyle, labelStyle as sharedLabelStyle } from "@/lib/styles";
import { parseTo12h, to24h } from "@/lib/utils";
import HelpTooltip from "@/components/HelpTooltip";
import CustomSelect from "@/components/CustomSelect";

// ── Re-exports for convenience ───────────────────────────────────────────────
export const labelStyle = sharedLabelStyle;
export const inputStyle: React.CSSProperties = {};

// ── Common IANA timezones ─────────────────────────────────────────────────────
export const TIMEZONES = [
  { value: "America/New_York",    label: "Eastern (ET) — New York" },
  { value: "America/Chicago",     label: "Central (CT) — Chicago" },
  { value: "America/Denver",      label: "Mountain (MT) — Denver" },
  { value: "America/Phoenix",     label: "Mountain (no DST) — Phoenix" },
  { value: "America/Los_Angeles", label: "Pacific (PT) — Los Angeles" },
  { value: "America/Anchorage",   label: "Alaska (AKT) — Anchorage" },
  { value: "Pacific/Honolulu",    label: "Hawaii (HT) — Honolulu" },
  { value: "America/Toronto",     label: "Eastern (ET) — Toronto" },
  { value: "America/Vancouver",   label: "Pacific (PT) — Vancouver" },
  { value: "America/Winnipeg",    label: "Central (CT) — Winnipeg" },
  { value: "America/Halifax",     label: "Atlantic (AT) — Halifax" },
  { value: "America/St_Johns",    label: "Newfoundland (NT) — St. John's" },
  { value: "Europe/London",       label: "GMT/BST — London" },
  { value: "Europe/Paris",        label: "CET/CEST — Paris" },
  { value: "Australia/Sydney",    label: "AEST/AEDT — Sydney" },
  { value: "Australia/Melbourne", label: "AEST/AEDT — Melbourne" },
  { value: "Pacific/Auckland",    label: "NZST/NZDT — Auckland" },
];

/** Normalize a time string to "HH:MM" for comparison (handles "HH:MM:SS" and null). */
export function normalizeTimeCompare(t: string | null | undefined): string | null {
  if (!t) return null;
  return t.slice(0, 5);
}

// ── Section wrapper ────────────────────────────────────────────────────────────
export function Section({
  title,
  children,
  maxWidth = 860,
  noPadding = false,
  helpText,
}: {
  title: string;
  children: React.ReactNode;
  maxWidth?: number;
  noPadding?: boolean;
  helpText?: string;
}) {
  return (
    <div
      style={{
        ...sectionStyle,
        width: "100%",
        maxWidth,
        flexShrink: 0,
      }}
    >
      <div
        style={{ ...sectionHeaderStyle, display: "flex", alignItems: "center", gap: 8 }}
      >
        {title}
        {helpText && <HelpTooltip text={helpText} side="right" />}
      </div>
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
        <button
          key={c.id}
          type="button"
          onClick={() => !disabled && onChange(c)}
          disabled={disabled}
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
          title={c.name}
        >
          {active.id === c.id && <span style={{ width: 8, height: 8, borderRadius: "50%", background: c.text }} />}
        </button>
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
