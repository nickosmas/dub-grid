"use client";

import { useTheme } from "next-themes";
import { getAvatarTone } from "@dubgrid/design-tokens";
import { resolveShiftPillColors } from "@/lib/colors";

const PREVIEW_PILLS = [
  { label: "AM", color: "#BFDBFE", text: "#1D4ED8", border: "#93C5FD" },
  { label: "PM", color: "#BBF7D0", text: "#166534", border: "#86EFAC" },
  { label: "Off", color: "#E2E8F0", text: "#334155", border: "#CBD5E1" },
];

/**
 * A compact, self-contained mockup — not the live app chrome itself — so a
 * user can see what light/dark actually looks like without hunting around
 * the page. Built entirely from `var(--color-*)` tokens and the same
 * shift-pill/avatar dark-mode resolvers the real app uses, so it re-renders
 * instantly (no extra state) whenever the selected theme changes.
 */
export function AppearancePreview() {
  const { resolvedTheme } = useTheme();
  const isDarkTheme = resolvedTheme === "dark";
  const avatarTone = getAvatarTone("preview", isDarkTheme);

  return (
    <div
      aria-hidden="true"
      style={{
        border: "1px solid var(--color-border)",
        borderRadius: "var(--dg-radius-lg)",
        background: "var(--color-bg)",
        padding: 14,
        maxWidth: 320,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          background: "var(--color-surface)",
          border: "1px solid var(--color-border-light)",
          borderRadius: "var(--dg-radius-md)",
          padding: "10px 12px",
        }}
      >
        <div
          style={{
            width: 30,
            height: 30,
            borderRadius: "9999px",
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 12,
            fontWeight: 700,
            background: avatarTone.backgroundColor,
            border: `1px solid ${avatarTone.borderColor}`,
            color: avatarTone.textColor,
          }}
        >
          JL
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: "var(--color-text-primary)",
              lineHeight: 1.2,
            }}
          >
            Jordan Lee
          </div>
          <div style={{ fontSize: 11, color: "var(--color-text-muted)", lineHeight: 1.3 }}>
            Full-time · Nursing
          </div>
        </div>
        <button type="button" className="dg-btn dg-btn-primary" style={{ pointerEvents: "none" }}>
          + Shift
        </button>
      </div>

      <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
        {PREVIEW_PILLS.map((pill) => {
          const resolved = resolveShiftPillColors(pill, isDarkTheme);
          return (
            <div
              key={pill.label}
              style={{
                flex: 1,
                textAlign: "center",
                fontSize: 11,
                fontWeight: 700,
                borderRadius: "var(--dg-radius-sm)",
                padding: "6px 0",
                background: resolved.color,
                color: resolved.text,
                border: `1px solid ${resolved.border}`,
              }}
            >
              {pill.label}
            </div>
          );
        })}
      </div>
    </div>
  );
}
