"use client";

import React, { useId, useRef, useState } from "react";
import { useTheme } from "next-themes";
import {
  PREDEFINED_COLOR_GROUPS,
  getPresetByBg,
  toDarkPillColors,
  PredefinedColor,
} from "@/lib/colors";
import { sectionStyle, labelStyle as sharedLabelStyle } from "@/lib/styles";
import { Button } from "@/components/Button";
import { parseTo12h, to24h } from "@/lib/utils";
import CustomSelect from "@/components/CustomSelect";
import { MaybeHint } from "@/components/ui/hint";
import { Popover, PopoverContent } from "@/components/ui/popover";

// ── Re-exports for convenience ───────────────────────────────────────────────
export const labelStyle = sharedLabelStyle;
export const inputStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box" as const,
  height: 36,
  padding: "0 10px",
  borderWidth: 1,
  borderStyle: "solid",
  borderColor: "var(--dg-color-border)",
  borderRadius: "var(--dg-btn-radius)",
  fontSize: "var(--dg-type-control-size)",
  fontWeight: "var(--dg-type-control-weight)",
  fontFamily: "inherit",
  color: "var(--dg-color-text-primary)",
  background: "var(--dg-color-surface)",
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
  maxWidth = 1120,
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
        margin: "0 auto",
        flexShrink: 0,
      }}
    >
      {noPadding ? children : <div style={{ padding: "20px" }}>{children}</div>}
    </div>
  );
}

// ── Preset Color Picker ──────────────────────────────────────────────────────
export function PresetColorPicker({
  valueBg,
  onChange,
  disabled,
}: {
  valueBg: string;
  onChange: (c: PredefinedColor) => void;
  disabled?: boolean;
}) {
  const { resolvedTheme } = useTheme();
  const isDarkTheme = resolvedTheme === "dark";
  const active = getPresetByBg(valueBg);
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popupId = useId();

  // Swatches preview as they'll actually render in the schedule grid, so
  // picking a color in dark mode shows the same dark-mode-adapted chip.
  const toDisplay = (preset: PredefinedColor): { bg: string; text: string } =>
    isDarkTheme ? toDarkPillColors(preset.bg) : { bg: preset.bg, text: preset.text };
  const activeDisplay = toDisplay(active);

  return (
    <>
      <div style={{ display: "inline-flex", flexDirection: "column", gap: 8 }}>
        <MaybeHint content={active.name} side="top">
          <Button
            ref={triggerRef}
            type="button"
            onClick={() => {
              if (!disabled) setOpen((prev) => !prev);
            }}
            disabled={disabled}
            title={active.name}
            aria-haspopup="dialog"
            aria-expanded={open}
            aria-controls={open ? popupId : undefined}
            aria-label={`Color preset: ${active.name}`}
            style={{
              width: 40,
              height: 40,
              padding: 4,
              borderRadius: "9999px",
              border: "1px solid var(--dg-color-border)",
              background: "var(--dg-color-surface)",
              cursor: disabled ? "not-allowed" : "pointer",
              opacity: disabled ? 0.55 : 1,
            }}
          >
            <span
              aria-hidden="true"
              style={{
                display: "block",
                width: "100%",
                height: "100%",
                borderRadius: "9999px",
                background: activeDisplay.bg,
                border: `1px solid ${activeDisplay.text}`,
                boxShadow: open ? `inset 0 0 0 1px ${activeDisplay.text}` : undefined,
              }}
            />
          </Button>
        </MaybeHint>
      </div>

      {open && triggerRef.current && (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverContent
            id={popupId}
            role="dialog"
            aria-label="Choose color preset"
            anchor={triggerRef}
            side="right"
            align="start"
            sideOffset={8}
            positionMethod="fixed"
            collisionPadding={12}
            collisionAvoidance={{
              side: "flip",
              align: "shift",
              fallbackAxisSide: "none",
            }}
            initialFocus={false}
            style={{
              width: "min(344px, calc(100vw - 24px))",
              maxWidth: "calc(100vw - 24px)",
              maxHeight: "min(420px, var(--available-height, calc(100vh - 24px)))",
              overflowY: "auto",
              overscrollBehavior: "contain",
              padding: 14,
              borderRadius: "var(--dg-radius-lg)",
              background: "var(--dg-color-surface)",
              border: "1px solid var(--dg-color-border)",
              boxShadow: "var(--shadow-menu)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                marginBottom: 12,
              }}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <div
                  style={{
                    fontSize: "var(--dg-type-field-title-size)",
                    fontWeight: "var(--dg-type-field-title-weight)",
                    letterSpacing: "var(--dg-type-field-title-letter-spacing)",
                    lineHeight: "var(--dg-type-field-title-line-height)",
                    color: "var(--dg-type-field-title-color)",
                  }}
                >
                  Palette
                </div>
                <div
                  style={{
                    fontSize: "var(--dg-fs-label)",
                    fontWeight: 700,
                    color: "var(--dg-color-text-primary)",
                  }}
                >
                  {active.name}
                </div>
              </div>
              <div
                aria-hidden="true"
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: "9999px",
                  background: activeDisplay.bg,
                  border: `1px solid ${activeDisplay.text}`,
                  boxShadow: `inset 0 0 0 1px ${activeDisplay.text}`,
                }}
              />
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {PREDEFINED_COLOR_GROUPS.map((group) => (
                <div key={group.id} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <div
                    style={{
                      fontSize: "var(--dg-type-field-title-size)",
                      fontWeight: "var(--dg-type-field-title-weight)",
                      letterSpacing: "var(--dg-type-field-title-letter-spacing)",
                      lineHeight: "var(--dg-type-field-title-line-height)",
                      color: "var(--dg-type-field-title-color)",
                    }}
                  >
                    {group.label}
                  </div>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(10, minmax(0, 1fr))",
                      gap: 8,
                    }}
                  >
                    {group.colors.map((color) => {
                      const colorDisplay = toDisplay(color);
                      return (
                        <MaybeHint key={color.id} content={color.name} side="top">
                          <Button
                            type="button"
                            onClick={() => {
                              if (disabled) return;
                              onChange(color);
                              setOpen(false);
                            }}
                            disabled={disabled}
                            title={color.name}
                            aria-label={color.name}
                            style={{
                              width: 28,
                              height: 28,
                              borderRadius: "9999px",
                              background: colorDisplay.bg,
                              border:
                                active.id === color.id
                                  ? `2px solid ${colorDisplay.text}`
                                  : "1px solid var(--dg-color-border)",
                              cursor: disabled ? "not-allowed" : "pointer",
                              padding: 0,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              boxShadow:
                                active.id === color.id
                                  ? `0 0 0 1px ${colorDisplay.text}`
                                  : undefined,
                            }}
                          >
                            {active.id === color.id && (
                              <span
                                style={{
                                  width: 10,
                                  height: 10,
                                  borderRadius: "9999px",
                                  background: colorDisplay.text,
                                }}
                              />
                            )}
                          </Button>
                        </MaybeHint>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      )}
    </>
  );
}

// ── 12-hour time picker ───────────────────────────────────────────────────────
export function TimeInput12h({
  value,
  onChange,
  disabled,
}: {
  value: string | null | undefined;
  onChange: (v: string | null) => void;
  disabled?: boolean;
}) {
  const { hour, minute, period } = parseTo12h(value);

  const hourOptions = [
    { value: "", label: "--" },
    ...[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((h) => ({ value: String(h), label: String(h) })),
  ];
  const minuteOptions = [
    "00",
    "05",
    "10",
    "15",
    "20",
    "25",
    "30",
    "35",
    "40",
    "45",
    "50",
    "55",
  ].map((m) => ({ value: m, label: m }));
  const periodOptions = [
    { value: "AM" as const, label: "AM" },
    { value: "PM" as const, label: "PM" },
  ];

  return (
    <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
      <CustomSelect
        value={hour}
        options={hourOptions}
        onChange={(val) => onChange(to24h(val, minute, period))}
        disabled={disabled}
        fontSize={13}
        style={{ width: 72 }}
      />
      <span style={{ fontWeight: 700, color: "var(--dg-color-text-muted)" }}>:</span>
      <CustomSelect
        value={minute}
        options={minuteOptions}
        onChange={(val) => onChange(to24h(hour, val, period))}
        disabled={disabled}
        fontSize={13}
        style={{ width: 72 }}
      />
      <CustomSelect
        value={period}
        options={periodOptions}
        onChange={(val) => onChange(to24h(hour, minute, val as "AM" | "PM"))}
        disabled={disabled}
        fontSize={13}
        style={{ width: 78 }}
      />
    </div>
  );
}
