"use client";

import React, { useId, useRef, useState } from "react";
import {
  PREDEFINED_COLOR_GROUPS,
  getPresetByBg,
  PredefinedColor,
} from "@/lib/colors";
import { sectionStyle, labelStyle as sharedLabelStyle } from "@/lib/styles";
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
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popupId = useId();

  return (
    <>
      <div style={{ display: "inline-flex", flexDirection: "column", gap: 8 }}>
        <MaybeHint content={active.name} side="top">
          <button
            ref={triggerRef}
            type="button"
            onClick={() => !disabled && setOpen((prev) => !prev)}
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
              border: "1px solid var(--color-border)",
              background: "var(--color-surface)",
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
                background: active.bg,
                border: `1px solid ${active.text}`,
                boxShadow: open ? `inset 0 0 0 1px ${active.text}` : undefined,
              }}
            />
          </button>
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
              borderRadius: "var(--dg-radius-md)",
              background: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              boxShadow: "var(--shadow-float)",
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
                    fontSize: "var(--dg-fs-caption)",
                    fontWeight: 800,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    color: "var(--color-text-muted)",
                  }}
                >
                  Palette
                </div>
                <div
                  style={{
                    fontSize: "var(--dg-fs-label)",
                    fontWeight: 700,
                    color: "var(--color-text-primary)",
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
                  background: active.bg,
                  border: `1px solid ${active.text}`,
                  boxShadow: `inset 0 0 0 1px ${active.text}`,
                }}
              />
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {PREDEFINED_COLOR_GROUPS.map((group) => (
                <div key={group.id} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <div
                    style={{
                      fontSize: "var(--dg-fs-caption)",
                      fontWeight: 800,
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      color: "var(--color-text-muted)",
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
                    {group.colors.map((color) => (
                      <MaybeHint key={color.id} content={color.name} side="top">
                        <button
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
                            background: color.bg,
                            border: active.id === color.id ? `2px solid ${color.text}` : "1px solid var(--color-border)",
                            cursor: disabled ? "not-allowed" : "pointer",
                            padding: 0,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            boxShadow:
                              active.id === color.id
                                ? `0 0 0 1px ${color.text}`
                                : undefined,
                          }}
                        >
                          {active.id === color.id && (
                            <span
                              style={{
                                width: 10,
                                height: 10,
                                borderRadius: "9999px",
                                background: color.text,
                              }}
                            />
                          )}
                        </button>
                      </MaybeHint>
                    ))}
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
