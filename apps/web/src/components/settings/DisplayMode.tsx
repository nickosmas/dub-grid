"use client";

import React, { useState, useCallback } from "react";
import { JobDefinition, Organization, ShiftCategory, ShiftDisplayMode } from "@/types";
import {
  OrganizationSettingsConflictError,
  updateOrganizationSettings,
} from "@/features/organization/client";
import { toast } from "sonner";
import * as Sentry from "@/lib/sentry";
import { EDITOR_ACTION_LABELS } from "@/components/ui/editor-action-labels";
import { buildShiftDisplayParts } from "@/lib/assignable-shifts";
import { resolveJobColorsForShift } from "@/lib/job-placement";
import { useTheme } from "next-themes";
import { borderColor, resolveShiftPillColors } from "@/lib/colors";

const PREVIEW_DAYS = [
  { shortLabel: "Mon", dateNumber: "21" },
  { shortLabel: "Tue", dateNumber: "22" },
  { shortLabel: "Wed", dateNumber: "23" },
];

const SAMPLE_SHIFT_CATEGORIES: ShiftCategory[] = [
  {
    id: -1,
    orgId: "sample",
    name: "Day Shift",
    abbr: "D",
    color: "#BFDBFE",
    sortOrder: 0,
  },
  {
    id: -2,
    orgId: "sample",
    name: "Evening",
    abbr: "EVE",
    color: "#FDE68A",
    sortOrder: 1,
  },
  {
    id: -3,
    orgId: "sample",
    name: "Night Shift",
    abbr: "N",
    color: "#DDD6FE",
    sortOrder: 2,
  },
];

const SAMPLE_JOBS: JobDefinition[] = [
  {
    id: -101,
    orgId: "sample",
    name: "Staff",
    abbr: "STA",
    showOnGrid: true,
    eligibleRoleIds: [],
    requiredCertificationIds: [],
    color: "#DBEAFE",
    border: "#93C5FD",
    text: "#1E3A8A",
    sortOrder: 0,
  },
];

type PreviewShift = {
  id: string;
  color: string;
  border: string;
  text: string;
  primaryLabel: string;
  secondaryLabel: string | null;
};

function getPreviewShifts(args: {
  mode: ShiftDisplayMode;
  shiftCategories: ShiftCategory[];
  jobs: JobDefinition[];
}): PreviewShift[] {
  const { mode, shiftCategories, jobs } = args;
  const activeShifts = shiftCategories
    .filter((shiftCategory) => !shiftCategory.archivedAt)
    .sort((left, right) => left.sortOrder - right.sortOrder);
  const previewShifts = [...activeShifts, ...SAMPLE_SHIFT_CATEGORIES].slice(0, 3);
  const previewJob =
    jobs.find((job) => !job.archivedAt && job.systemKey !== "regular_staff") ?? SAMPLE_JOBS[0]!;

  return previewShifts.map((shift) => {
    const displayParts = buildShiftDisplayParts({
      shift,
      job: previewJob,
      shiftDisplayMode: mode,
    });
    const colors = resolveJobColorsForShift(previewJob, shift);

    return {
      id: `${shift.id}:${previewJob.id}`,
      color: colors.color,
      border: colors.border,
      text: colors.text,
      primaryLabel: displayParts.primaryLabel,
      secondaryLabel: displayParts.secondaryLabel,
    };
  });
}

function DisplayModePreviewPill({
  mode,
  sample,
}: {
  mode: ShiftDisplayMode;
  sample: PreviewShift;
}) {
  const showSecondaryLine = !!sample.secondaryLabel;
  const { resolvedTheme } = useTheme();
  const resolved = resolveShiftPillColors(
    { color: sample.color, text: sample.text, border: sample.border },
    resolvedTheme === "dark",
  );

  return (
    <div
      data-shift-pill="single"
      style={{
        background: resolved.color,
        border: `1px solid ${borderColor(resolved.text)}`,
        borderRadius: 8,
        color: resolved.text,
        display: "flex",
        flex: 1,
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: showSecondaryLine ? 1 : 0,
        minWidth: 0,
        overflow: "hidden",
        padding: mode === "name" ? "2px 6px" : "2px 3px",
        textAlign: "center",
      }}
    >
      <span
        style={
          mode === "name"
            ? {
                fontSize: "var(--dg-fs-caption)",
                fontWeight: 800,
                lineHeight: 1.2,
                maxWidth: "100%",
                overflow: "hidden",
                overflowWrap: "break-word" as const,
                display: "-webkit-box",
                WebkitBoxOrient: "vertical" as const,
                WebkitLineClamp: showSecondaryLine ? 1 : 2,
              }
            : {
                fontSize: "var(--dg-fs-title)",
                fontWeight: 800,
                lineHeight: 1.2,
                maxWidth: "100%",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }
        }
      >
        {sample.primaryLabel}
      </span>
      {showSecondaryLine ? (
        <span
          style={{
            fontSize: "var(--dg-fs-footnote)",
            fontWeight: 700,
            lineHeight: 1.3,
            maxWidth: "100%",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            opacity: 0.78,
          }}
        >
          {sample.secondaryLabel}
        </span>
      ) : null}
    </div>
  );
}

export function DisplayModeSample({
  mode,
  shiftCategories = [],
  jobs = [],
}: {
  mode: ShiftDisplayMode;
  shiftCategories?: ShiftCategory[];
  jobs?: JobDefinition[];
}) {
  const samples = getPreviewShifts({
    mode,
    shiftCategories,
    jobs,
  });

  return (
    <div
      data-display-mode-sample={mode}
      aria-hidden="true"
      style={{
        width: "100%",
        borderRadius: "var(--dg-radius-lg)",
        border: "1px solid var(--color-border)",
        background: "var(--color-surface)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(96px, 1.05fr) repeat(3, minmax(0, 1fr))",
          minWidth: 0,
        }}
      >
        <div
          data-display-mode-sample-staff-header="true"
          style={{
            position: "relative",
            zIndex: 2,
            background: "var(--color-bg)",
            padding: "10px var(--dg-space-md)",
            fontSize: "var(--dg-fs-footnote)",
            fontWeight: 600,
            color: "var(--color-text-subtle)",
            letterSpacing: "0.04em",
            boxShadow:
              "1px 0 0 0 var(--color-border-light), 0 1px 0 0 var(--color-dark), 2px 0 4px rgba(0,0,0,0.02)",
          }}
        >
          Staff
        </div>
        {PREVIEW_DAYS.map((day, index) => (
          <div
            key={day.shortLabel}
            className="dg-grid-slot dg-grid-slot--header"
            data-leading-divider={index === 0 ? "split" : "light"}
            style={{
              position: "relative",
              textAlign: "center",
              padding: "8px 0",
              boxShadow: "0 1px 0 0 var(--color-dark)",
            }}
          >
            <div className="dg-grid-slot__chrome" aria-hidden="true" />
            <div
              style={{
                fontSize: "var(--dg-fs-caption)",
                fontWeight: 600,
                color: "var(--color-text-subtle)",
                letterSpacing: "0.04em",
              }}
            >
              {day.shortLabel}
            </div>
            <div
              style={{
                fontSize: "var(--dg-fs-title)",
                fontWeight: 700,
                color: "var(--color-text-secondary)",
                lineHeight: "var(--dg-lh-tight)",
                marginTop: 1,
              }}
            >
              {day.dateNumber}
            </div>
          </div>
        ))}

        <div
          style={{
            background: "var(--color-surface)",
            padding: "7px var(--dg-space-md)",
            display: "flex",
            alignItems: "center",
            minWidth: 0,
            boxShadow: "1px 0 0 0 var(--color-border-light), 2px 0 4px rgba(0,0,0,0.02)",
          }}
        >
          <span
            style={{
              fontSize: "var(--dg-fs-label)",
              fontWeight: 600,
              color: "var(--color-text-secondary)",
              lineHeight: "var(--dg-lh-tight)",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            J. Smith
          </span>
        </div>
        {samples.map((sample, index) => (
          <div
            key={sample.id}
            className="dg-grid-cell"
            data-leading-divider={index === 0 ? "split" : "light"}
            data-top-divider="dark"
            data-interactive="false"
            style={{
              height: "var(--dg-grid-cell-height)",
              background: "var(--color-surface)",
            }}
          >
            <div className="dg-grid-cell__chrome" aria-hidden="true" />
            <div
              className="dg-grid-cell__content"
              style={{
                paddingTop: 4,
                paddingRight: 4,
                paddingBottom: 4,
                paddingLeft: index === 0 ? 4 : 5,
              }}
            >
              <DisplayModePreviewPill mode={mode} sample={sample} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export const DISPLAY_MODES: {
  id: ShiftDisplayMode;
  title: string;
  description: string;
  details: string[];
}[] = [
  {
    id: "code",
    title: "Short Codes",
    description:
      "Display abbreviations like D, EVE, N on the grid. Best when your team scans the schedule by compact shift labels.",
    details: [
      "The schedule grid, monthly calendar, and recurring-pattern editor show short codes in each cell",
      "Everywhere else in the app, shifts are always shown by their full name",
      "Compact display fits well in all views including 2-week",
    ],
  },
  {
    id: "name",
    title: "Full Names",
    description:
      "Display descriptive names like Day Shift, Evening, Night on the grid. Best for organizations that don't use codes.",
    details: [
      "The schedule grid, monthly calendar, and recurring-pattern editor show the full shift name in each cell",
      "Shift cells take up more room to fit the longer text",
    ],
  },
];

export default function DisplayMode({
  organization,
  shiftCategories = [],
  jobs = [],
  onSave,
}: {
  organization: Organization;
  shiftCategories?: ShiftCategory[];
  jobs?: JobDefinition[];
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

  return (
    <div>
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
          <div
            style={{
              fontSize: "var(--dg-fs-label)",
              fontWeight: 700,
              color: "var(--color-text-primary)",
            }}
          >
            Choose a display mode
          </div>
          <div
            style={{
              fontSize: "var(--dg-fs-caption)",
              color: "var(--color-text-muted)",
              lineHeight: 1.5,
            }}
          >
            Select how shifts appear in the schedule grid, monthly calendar, and recurring-pattern
            editor. Everywhere else, shifts are always shown by their full name.
          </div>
        </div>

        <div style={{ padding: 18 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            {modes.map((mode) => {
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
                    border: isActive
                      ? "2px solid var(--color-brand-border)"
                      : "1px solid var(--color-border)",
                    background: isActive ? "var(--color-brand-bg)" : "var(--color-surface)",
                    cursor: "pointer",
                    textAlign: "left",
                    transition: "border-color 150ms ease, background 150ms ease",
                  }}
                >
                  {/* Radio indicator + title */}
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div
                      style={{
                        width: 18,
                        height: 18,
                        borderRadius: "50%",
                        border: isActive
                          ? "2px solid var(--color-brand)"
                          : "2px solid var(--color-border-strong, #94a3b8)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}
                    >
                      {isActive && (
                        <div
                          style={{
                            width: 10,
                            height: 10,
                            borderRadius: "50%",
                            background: "var(--color-brand)",
                          }}
                        />
                      )}
                    </div>
                    <span
                      style={{ fontWeight: 700, fontSize: 15, color: "var(--color-text-primary)" }}
                    >
                      {mode.title}
                    </span>
                  </div>

                  {/* Description */}
                  <p
                    style={{
                      fontSize: 13,
                      color: "var(--color-text-muted)",
                      lineHeight: 1.5,
                      margin: 0,
                    }}
                  >
                    {mode.description}
                  </p>

                  {/* Sample grid */}
                  <DisplayModeSample mode={mode.id} shiftCategories={shiftCategories} jobs={jobs} />
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
