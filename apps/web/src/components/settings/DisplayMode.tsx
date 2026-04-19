"use client";

import React, { useState, useCallback } from "react";
import { Organization, ShiftCode, ShiftDisplayMode } from "@/types";
import {
  OrganizationSettingsConflictError,
  updateOrganizationSettings,
} from "@/lib/db";
import { toast } from "sonner";
import * as Sentry from "@/lib/sentry";
import { ExplainerSection } from "@/components/ui/explainer-section";
import { EDITOR_ACTION_LABELS } from "@/components/ui/editor-action-labels";

const SAMPLE_SHIFTS = [
  { label: "D", name: "Day Shift", color: "#DBEAFE", text: "#1E40AF", border: "#93C5FD" },
  { label: "EVE", name: "Evening", color: "#FEF3C7", text: "#92400E", border: "#FCD34D" },
  { label: "N", name: "Night Shift", color: "#EDE9FE", text: "#5B21B6", border: "#C4B5FD" },
];

function getPreviewShifts(shiftCodes: ShiftCode[]) {
  return shiftCodes.length >= 3
    ? shiftCodes.slice(0, 3).map((sc) => ({
        label: sc.label,
        name: sc.name,
        color: sc.color,
        text: sc.text,
        border: sc.border,
      }))
    : SAMPLE_SHIFTS;
}

export function DisplayModeSample({ mode, shiftCodes }: { mode: ShiftDisplayMode; shiftCodes: ShiftCode[] }) {
  const samples = getPreviewShifts(shiftCodes);

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

export const DISPLAY_MODES: { id: ShiftDisplayMode; title: string; description: string; details: string[] }[] = [
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
    if (!organization.updatedAt) {
      toast.error("Organization data is out of date. Refresh and try again.");
      return;
    }
    setSaving(true);
    try {
      const updated = await updateOrganizationSettings({
        orgId: organization.id,
        expectedUpdatedAt: organization.updatedAt,
        shiftDisplayMode: selected,
      });
      onSave(updated);
      toast.success("Display mode updated");
    } catch (err) {
      if (err instanceof OrganizationSettingsConflictError) {
        onSave(err.latestOrganization);
        setSelected(err.latestOrganization.shiftDisplayMode);
        toast.error("Display mode changed elsewhere. Review the latest value and try again.");
      } else {
        Sentry.captureException(err);
        toast.error("Failed to update display mode");
      }
    } finally {
      setSaving(false);
    }
  }, [organization, selected, onSave]);

  const handleCancel = useCallback(() => {
    setSelected(organization.shiftDisplayMode);
  }, [organization.shiftDisplayMode]);

  const modes = DISPLAY_MODES;
  const displayPoints = selected === "name"
    ? [
        {
          title: "Grid cells show full shift names",
          description: "This mode favors readability for teams that do not rely on internal shift abbreviations.",
        },
        {
          title: "Short codes fade into the background",
          description: "People creating and reading the schedule primarily work with full shift names across the app.",
        },
        {
          title: "Best for descriptive schedules",
          description: "Choose this when clarity matters more than fitting the shortest possible label into each schedule cell.",
        },
      ]
    : [
        {
          title: "Grid cells stay compact with short codes",
          description: "This mode keeps the schedule dense and easy to scan when your team already uses standard abbreviations.",
        },
        {
          title: "Full names are still available when editing",
          description: "People can still see the descriptive shift name while choosing or reviewing shifts.",
        },
        {
          title: "Best for space-constrained views",
          description: "Choose this when short labels make the week, two-week, and print views easier to fit and compare.",
        },
      ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <ExplainerSection
        title="Display mode guide"
        defaultOpen
        storageKey="dg-explainer-display-mode"
        points={displayPoints}
      />

      <div
        style={{
          borderRadius: "var(--dg-radius-lg)",
          border: "1px solid var(--color-border)",
          background: "var(--color-bg)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: "16px 18px",
            borderBottom: "1px solid var(--color-border-light)",
            display: "flex",
            flexDirection: "column",
            gap: 4,
          }}
        >
          <div style={{ fontSize: "var(--dg-fs-label)", fontWeight: 700, color: "var(--color-text-primary)" }}>
            Choose a display mode
          </div>
          <div style={{ fontSize: "var(--dg-fs-caption)", color: "var(--color-text-muted)", lineHeight: 1.5 }}>
            Select the visual language people should see across the schedule and related views.
          </div>
        </div>

        <div style={{ padding: 18 }}>
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
                    borderRadius: "var(--dg-radius-md)",
                    border: isActive ? "2px solid var(--color-brand-border)" : "1px solid var(--color-border)",
                    background: isActive ? "var(--color-brand-bg)" : "var(--color-surface)",
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
        </div>

        <div
          style={{
            padding: "14px 18px",
            borderTop: "1px solid var(--color-border-light)",
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
            background: "var(--color-surface)",
          }}
        >
          {isModified ? (
            <button
              type="button"
              onClick={handleCancel}
              disabled={saving}
              className="dg-btn dg-btn-secondary"
            >
              {EDITOR_ACTION_LABELS.cancel}
            </button>
          ) : null}
          <button
            type="button"
            onClick={handleSave}
            disabled={!isModified || saving}
            className="dg-btn dg-btn-primary"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
