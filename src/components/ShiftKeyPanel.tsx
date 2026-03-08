"use client";

import { ShiftType } from "@/types";

const EXCLUDED = new Set(["OFF", "0.3"]);

export default function ShiftKeyPanel({ shiftTypes }: { shiftTypes: ShiftType[] }) {
  const items = shiftTypes.filter((s) => !EXCLUDED.has(s.label));

  // marginTop aligns panel top with the first wing container (skips section label).
  // sticky + max-height caps the panel at the viewport bottom.
  return (
    <div
      style={{
        flex: 1,
        minWidth: 0,
        marginTop: 34,
        background: "#fff",
        borderRadius: 12,
        border: "1px solid var(--color-border)",
        boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
        padding: "14px 14px",
        position: "sticky",
        top: 16,
        maxHeight: "calc(100vh - 32px)",
        overflowY: "auto",
      }}
    >
      <div
        style={{
          fontSize: 16,
          fontWeight: 700,
          color: "var(--color-text-secondary)",
          marginBottom: 14,
        }}
      >
        Shift Code Key
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
        {items.map((s) => (
          <div
            key={s.label}
            style={{ display: "flex", alignItems: "center", gap: 8 }}
          >
            <span
              style={{
                background: s.color,
                border: `1px solid ${s.border}`,
                color: s.text,
                borderRadius: 6,
                padding: "2px 7px",
                fontSize: 11,
                fontWeight: 700,
                flexShrink: 0,
                minWidth: 32,
                textAlign: "center",
              }}
            >
              {s.label}
            </span>
            <span
              style={{
                fontSize: 11,
                color: "var(--color-text-muted)",
                lineHeight: 1.3,
              }}
            >
              {s.name}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
