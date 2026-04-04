"use client";

import React, { useState, useCallback } from "react";
import { Organization, ShiftCode, ShiftDisplayMode } from "@/types";
import { updateOrganization } from "@/lib/db";
import { toast } from "sonner";
import * as Sentry from "@/lib/sentry";

const SAMPLE_SHIFTS = [
  { label: "D", name: "Day Shift", color: "#DBEAFE", text: "#1E40AF", border: "#93C5FD" },
  { label: "EVE", name: "Evening", color: "#FEF3C7", text: "#92400E", border: "#FCD34D" },
  { label: "N", name: "Night Shift", color: "#EDE9FE", text: "#5B21B6", border: "#C4B5FD" },
];

function DisplayModeSample({ mode, shiftCodes }: { mode: ShiftDisplayMode; shiftCodes: ShiftCode[] }) {
  const samples = shiftCodes.length >= 3
    ? shiftCodes.slice(0, 3).map(sc => ({
        label: sc.label,
        name: sc.name,
        color: sc.color,
        text: sc.text,
        border: sc.border,
      }))
    : SAMPLE_SHIFTS;

  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: `80px repeat(3, 1fr)`,
      gap: 1,
      background: "var(--color-border)",
      borderRadius: 8,
      overflow: "hidden",
      fontSize: 11,
    }}>
      {/* Header row */}
      <div style={{ background: "var(--color-bg-secondary)", padding: "6px 8px", fontWeight: 600, color: "var(--color-text-faint)", fontSize: 10 }}>
        Staff
      </div>
      {["Mon", "Tue", "Wed"].map(day => (
        <div key={day} style={{ background: "var(--color-bg-secondary)", padding: "6px 4px", fontWeight: 600, color: "var(--color-text-faint)", fontSize: 10, textAlign: "center" }}>
          {day}
        </div>
      ))}

      {/* Employee row */}
      <div style={{ background: "var(--color-surface)", padding: "8px 8px", fontWeight: 600, color: "var(--color-text-primary)", fontSize: 11, display: "flex", alignItems: "center" }}>
        J. Smith
      </div>
      {samples.map((s, i) => (
        <div key={i} style={{ background: "var(--color-surface)", padding: 3, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{
            background: s.color,
            color: s.text,
            border: `1px solid ${s.border}`,
            borderRadius: 6,
            padding: "4px 6px",
            fontWeight: 800,
            fontSize: mode === "name" ? 9 : 11,
            textAlign: "center",
            width: "100%",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}>
            {mode === "name" ? s.name : s.label}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function DisplayMode({
  organization,
  shiftCodes,
  onSave,
}: {
  organization: Organization;
  shiftCodes: ShiftCode[];
  onSave: (org: Organization) => void;
}) {
  const [selected, setSelected] = useState<ShiftDisplayMode>(organization.shiftDisplayMode);
  const [saving, setSaving] = useState(false);
  const isModified = selected !== organization.shiftDisplayMode;

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const updated = { ...organization, shiftDisplayMode: selected };
      await updateOrganization(updated);
      onSave(updated);
      toast.success("Display mode updated");
    } catch (err) {
      Sentry.captureException(err);
      toast.error("Failed to update display mode");
    } finally {
      setSaving(false);
    }
  }, [organization, selected, onSave]);

  const modes: { id: ShiftDisplayMode; title: string; description: string; details: string[] }[] = [
    {
      id: "code",
      title: "Short Codes",
      description: "Display abbreviations like D, EVE, N on the grid. Best for organizations that use standardized shift codes.",
      details: [
        "The schedule grid shows short codes in each cell",
        "Both the code and full name are visible when creating shifts",
        "Compact display fits well in all views including 2-week",
      ],
    },
    {
      id: "name",
      title: "Full Names",
      description: "Display descriptive names like Day Shift, Evening, Night on the grid. Best for organizations that don't use codes.",
      details: [
        "The schedule grid shows the full shift name in each cell",
        "Short codes are hidden throughout the app",
        "When creating shifts, you only need to provide a name",
      ],
    },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Mode selection cards */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {modes.map(mode => {
          const isActive = selected === mode.id;
          return (
            <button
              key={mode.id}
              type="button"
              onClick={() => setSelected(mode.id)}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 12,
                padding: 16,
                borderRadius: 12,
                border: isActive ? "2px solid var(--color-brand)" : "1px solid var(--color-border)",
                background: isActive ? "var(--color-brand-bg, rgba(59,130,246,0.06))" : "var(--color-surface)",
                cursor: "pointer",
                textAlign: "left",
                transition: "border-color 150ms ease, background 150ms ease",
              }}
            >
              {/* Radio indicator + title */}
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{
                  width: 18,
                  height: 18,
                  borderRadius: "50%",
                  border: isActive ? "2px solid var(--color-brand)" : "2px solid var(--color-border-strong, #94a3b8)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}>
                  {isActive && <div style={{ width: 10, height: 10, borderRadius: "50%", background: "var(--color-brand)" }} />}
                </div>
                <span style={{ fontWeight: 700, fontSize: 15, color: "var(--color-text-primary)" }}>
                  {mode.title}
                </span>
              </div>

              {/* Description */}
              <p style={{ fontSize: 13, color: "var(--color-text-muted)", lineHeight: 1.5, margin: 0 }}>
                {mode.description}
              </p>

              {/* Sample grid */}
              <DisplayModeSample mode={mode.id} shiftCodes={shiftCodes} />
            </button>
          );
        })}
      </div>

      {/* How it works section */}
      <div style={{
        background: "var(--color-bg-secondary)",
        borderRadius: 10,
        padding: 20,
      }}>
        <h3 style={{
          fontSize: 12,
          fontWeight: 700,
          color: "var(--color-text-faint)",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          margin: "0 0 12px",
        }}>
          How it works — {modes.find(m => m.id === selected)?.title}
        </h3>
        <ul style={{ margin: 0, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 8 }}>
          {modes.find(m => m.id === selected)?.details.map((detail, i) => (
            <li key={i} style={{ fontSize: 13, color: "var(--color-text-secondary)", lineHeight: 1.5 }}>
              {detail}
            </li>
          ))}
        </ul>
      </div>

      {/* Save button */}
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button
          type="button"
          onClick={handleSave}
          disabled={!isModified || saving}
          style={{
            padding: "10px 24px",
            borderRadius: 8,
            border: "none",
            background: isModified ? "var(--color-brand)" : "var(--color-bg-secondary)",
            color: isModified ? "#fff" : "var(--color-text-faint)",
            fontWeight: 600,
            fontSize: 14,
            cursor: isModified ? "pointer" : "not-allowed",
            opacity: saving ? 0.6 : 1,
          }}
        >
          {saving ? "Saving..." : "Save Changes"}
        </button>
      </div>
    </div>
  );
}
