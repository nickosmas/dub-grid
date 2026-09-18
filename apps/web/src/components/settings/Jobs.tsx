"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "next-themes";
import type {
  Department,
  FocusArea,
  JobDefinition,
  JobEligibilityMode,
  JobShiftTimeOverride,
  NamedItem,
  Organization,
  ShiftCategory,
  ShiftDisplayMode,
} from "@/types";
import {
  checkJobDependencies,
  deleteJobDefinition,
  upsertJobDefinition,
} from "@/features/settings/client";
import type { DependencyInfo } from "@/features/settings/client";
import { Button } from "@/components/Button";
import { saveOrganizationSettingsWithRecovery } from "@/features/organization/client";
import { toast } from "sonner";
import * as Sentry from "@/lib/sentry";
import { useMediaQuery, MOBILE } from "@/hooks";
import ConfirmDialog from "@/components/ConfirmDialog";
import { EmptyState } from "@/components/EmptyState";
import { EditorActionRow } from "@/components/ui/editor-action-row";
import { NumberField } from "@/components/ui/number-field";
import { Switch } from "@/components/ui/switch";
import { EDITOR_ACTION_LABELS, getEditorDismissLabel } from "@/components/ui/editor-action-labels";
import { ButtonLoading } from "@/components/ButtonSpinner";
import { useUnsavedChangesPrompt } from "@/components/ui/use-unsaved-changes-prompt";
import { PresetColorPicker, TimeInput12h, inputStyle, labelStyle } from "./shared";
import {
  PREDEFINED_COLORS,
  TRANSPARENT_BORDER,
  borderColor,
  getPresetByBg,
  toDarkPillColors,
} from "@/lib/colors";
import { calcTimeDuration, fmt12h } from "@/lib/utils";
import { getQualificationSeniorityRank } from "@/lib/assignable-shifts";
import {
  getJobShiftColorOverride,
  getJobShiftTimeOverride,
  getStoredJobDepartmentIds,
  getStoredJobFocusAreaIds,
  normalizePlacementIds,
  normalizeShiftlessJobTiming,
  normalizeShiftColorOverrides,
  normalizeShiftTimeOverrides,
  resolveJobTimesForShift,
} from "@/lib/job-placement";
import {
  DEFAULT_SCHEDULED_JOB_STYLE,
  DEFAULT_SHIFT_JOB_SYSTEM_KEY,
  isDefaultShiftSystemJob,
  isProtectedSystemJob,
  isRegularStaffSystemJob,
} from "@/lib/system-jobs";
import {
  getCodeError,
  getLineTextError,
  normalizeCode,
  normalizeLineText,
} from "@/lib/form-validation";
import { formatClientErrorMessage } from "@/lib/client-facing";

type JobSection = "defaultShift" | "scheduled" | "shiftless";

type JobFormState = {
  name: string;
  abbr: string;
  departmentIds: number[];
  focusAreaIds: number[];
  applicableShiftIds: number[];
  eligibleRoleIds: number[];
  requiredCertificationIds: number[];
  eligibilityMode: JobEligibilityMode;
  shiftTimeOverrides: Record<string, JobShiftTimeOverride>;
  shiftColorOverrides: Record<string, string>;
  color: string;
  border: string;
  text: string;
  defaultStartTime: string | null;
  defaultEndTime: string | null;
  defaultDurationHours: number | null;
  defaultDurationMinutes: number | null;
};

const DEFAULT_JOB_PRESET_COLOR = DEFAULT_SCHEDULED_JOB_STYLE.color;
const DEFAULT_JOB_PRESET_TEXT = DEFAULT_SCHEDULED_JOB_STYLE.text;
const EMPTY_SCHEDULED_JOB_STYLE = {
  color: "",
  border: "",
  text: "",
} as const;
const DEFAULT_SHIFT_JOB_NAME = "Default shift job";
const DEFAULT_SHIFT_JOB_ABBR = "SHIFT";

function deriveJobAbbreviation(name: string): string {
  return name.trim().slice(0, 4).toUpperCase();
}

function getJobSection(job: Pick<JobDefinition, "assignmentMode">): JobSection {
  return job.assignmentMode === "shiftless" ? "shiftless" : "scheduled";
}

function isScheduledLikeSection(section: JobSection): boolean {
  return section !== "shiftless";
}

function sortByOrder<T extends { sortOrder: number; id: number }>(items: T[]): T[] {
  return [...items].sort((left, right) => left.sortOrder - right.sortOrder || left.id - right.id);
}

function compareJobsByQualificationSeniority(
  left: JobDefinition,
  right: JobDefinition,
  orgRoles: NamedItem[],
  certifications: NamedItem[],
): number {
  const leftRank = getQualificationSeniorityRank({
    job: left,
    orgRoles,
    certifications,
  });
  const rightRank = getQualificationSeniorityRank({
    job: right,
    orgRoles,
    certifications,
  });
  const leftRanked = leftRank != null;
  const rightRanked = rightRank != null;

  if (leftRanked !== rightRanked) {
    return leftRanked ? -1 : 1;
  }
  if (leftRank != null && rightRank != null && leftRank !== rightRank) {
    return leftRank - rightRank;
  }
  if (left.sortOrder !== right.sortOrder) {
    return left.sortOrder - right.sortOrder;
  }
  return left.name.localeCompare(right.name);
}

function formatCount(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function getShiftPreviewPrimaryLabel(args: {
  shiftName: string;
  shiftAbbr?: string | null;
  shiftDisplayMode: ShiftDisplayMode;
}): string {
  const { shiftName, shiftAbbr, shiftDisplayMode } = args;
  if (shiftDisplayMode === "name") return shiftName;

  const normalizedAbbr = shiftAbbr?.trim();
  if (normalizedAbbr) return normalizedAbbr;

  const initials = shiftName
    .split(/\s+/)
    .map((part) => part[0] ?? "")
    .join("")
    .toUpperCase();

  return initials || shiftName;
}

function getJobPreviewLabel(args: {
  jobName: string;
  jobAbbr: string;
  shiftDisplayMode: ShiftDisplayMode;
}): string {
  const { jobName, jobAbbr, shiftDisplayMode } = args;
  const normalizedName = jobName.trim();
  const normalizedAbbr = jobAbbr.trim();

  if (shiftDisplayMode === "name") {
    return normalizedName || normalizedAbbr || "Job";
  }

  return normalizedAbbr || normalizedName || "JOB";
}

function buildJobFormState(
  job: JobDefinition,
  shiftCategories: ShiftCategory[],
  focusAreas: FocusArea[],
): JobFormState {
  const normalizedTiming = normalizeShiftlessJobTiming(job);
  const activeFocusAreas = focusAreas.filter((focusArea) => !focusArea.archivedAt);
  const activeShifts = shiftCategories.filter((shift) => !shift.archivedAt);
  const departmentIds = normalizePlacementIds(getStoredJobDepartmentIds(job));
  const explicitFocusAreaIds = normalizePlacementIds(getStoredJobFocusAreaIds(job));
  const focusAreasInSelectedDepartments = activeFocusAreas.filter(
    (focusArea) => focusArea.departmentId != null && departmentIds.includes(focusArea.departmentId),
  );
  const focusAreaIds =
    departmentIds.length > 0
      ? explicitFocusAreaIds.length > 0
        ? explicitFocusAreaIds.filter((focusAreaId) =>
            focusAreasInSelectedDepartments.some((focusArea) => focusArea.id === focusAreaId),
          )
        : focusAreasInSelectedDepartments.map((focusArea) => focusArea.id)
      : explicitFocusAreaIds;
  const applicableShiftPool = activeShifts.filter(
    (shift) => shift.focusAreaId != null && focusAreaIds.includes(shift.focusAreaId),
  );
  const explicitShiftIds = normalizePlacementIds(job.applicableShiftIds);
  const applicableShiftIds =
    job.assignmentMode === "shiftless"
      ? []
      : explicitShiftIds.length > 0
        ? explicitShiftIds.filter((shiftId) =>
            applicableShiftPool.some((shift) => shift.id === shiftId),
          )
        : applicableShiftPool.map((shift) => shift.id);

  const isShiftlessJob = job.assignmentMode === "shiftless";

  return {
    name: job.name,
    abbr: job.abbr,
    departmentIds,
    focusAreaIds,
    applicableShiftIds,
    eligibleRoleIds: [...job.eligibleRoleIds],
    requiredCertificationIds: [...job.requiredCertificationIds],
    eligibilityMode: job.eligibilityMode ?? "and",
    shiftTimeOverrides: normalizeShiftTimeOverrides(job.shiftTimeOverrides),
    shiftColorOverrides: normalizeShiftColorOverrides(job.shiftColorOverrides),
    color: isShiftlessJob
      ? job.color !== "transparent"
        ? job.color
        : DEFAULT_JOB_PRESET_COLOR
      : EMPTY_SCHEDULED_JOB_STYLE.color,
    border: isShiftlessJob
      ? job.border !== "transparent"
        ? job.border
        : TRANSPARENT_BORDER
      : EMPTY_SCHEDULED_JOB_STYLE.border,
    text: isShiftlessJob
      ? job.text !== "transparent"
        ? job.text
        : DEFAULT_JOB_PRESET_TEXT
      : EMPTY_SCHEDULED_JOB_STYLE.text,
    defaultStartTime: normalizedTiming.defaultStartTime,
    defaultEndTime: normalizedTiming.defaultEndTime,
    defaultDurationHours: normalizedTiming.defaultDurationHours,
    defaultDurationMinutes: normalizedTiming.defaultDurationMinutes,
  };
}

function serializeJobFormState(form: JobFormState, section: JobSection): string {
  const normalizedTiming =
    section === "shiftless"
      ? normalizeShiftlessJobTiming({
          assignmentMode: "shiftless",
          defaultStartTime: form.defaultStartTime,
          defaultEndTime: form.defaultEndTime,
          defaultDurationHours: form.defaultDurationHours,
          defaultDurationMinutes: form.defaultDurationMinutes,
        })
      : {
          defaultStartTime: form.defaultStartTime ?? null,
          defaultEndTime: form.defaultEndTime ?? null,
          defaultDurationHours: form.defaultDurationHours ?? null,
          defaultDurationMinutes: form.defaultDurationMinutes ?? null,
        };

  return JSON.stringify({
    ...form,
    name: form.name.trim(),
    abbr: form.abbr.trim().toUpperCase(),
    color: section === "shiftless" ? form.color : EMPTY_SCHEDULED_JOB_STYLE.color,
    border: section === "shiftless" ? form.border : EMPTY_SCHEDULED_JOB_STYLE.border,
    text: section === "shiftless" ? form.text : EMPTY_SCHEDULED_JOB_STYLE.text,
    departmentIds: [...form.departmentIds].sort((left, right) => left - right),
    focusAreaIds: [...form.focusAreaIds].sort((left, right) => left - right),
    applicableShiftIds: [...form.applicableShiftIds].sort((left, right) => left - right),
    eligibleRoleIds: [...form.eligibleRoleIds].sort((left, right) => left - right),
    requiredCertificationIds: [...form.requiredCertificationIds].sort(
      (left, right) => left - right,
    ),
    shiftTimeOverrides: Object.fromEntries(
      Object.entries(normalizeShiftTimeOverrides(form.shiftTimeOverrides)).sort(
        ([leftId], [rightId]) => Number(leftId) - Number(rightId),
      ),
    ),
    shiftColorOverrides: Object.fromEntries(
      Object.entries(normalizeShiftColorOverrides(form.shiftColorOverrides)).sort(
        ([leftId], [rightId]) => Number(leftId) - Number(rightId),
      ),
    ),
    defaultStartTime: normalizedTiming.defaultStartTime,
    defaultEndTime: normalizedTiming.defaultEndTime,
    defaultDurationHours: normalizedTiming.defaultDurationHours,
    defaultDurationMinutes: normalizedTiming.defaultDurationMinutes,
  });
}

function ShiftPreviewPill({
  primary,
  secondary,
  bg,
  mode = "code",
  previewId,
}: {
  primary: string;
  secondary?: string | null;
  bg: string;
  mode?: ShiftDisplayMode;
  previewId?: string;
}) {
  const { resolvedTheme } = useTheme();
  const isDarkTheme = resolvedTheme === "dark";
  const preset = getPresetByBg(bg);
  const display = isDarkTheme ? toDarkPillColors(preset.bg) : preset;
  const isNameMode = mode === "name";

  return (
    <div
      data-job-shift-preview={previewId}
      style={{
        minWidth: isNameMode ? 132 : 70,
        maxWidth: isNameMode ? 172 : undefined,
        padding: isNameMode ? "10px 14px" : "8px 10px",
        borderRadius: "var(--dg-radius-lg)",
        background: display.bg,
        border: `1px solid ${borderColor(display.text)}`,
        color: display.text,
        display: "inline-flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: secondary ? 2 : 0,
        lineHeight: 1,
      }}
    >
      <span
        style={
          isNameMode
            ? {
                fontSize: "var(--dg-fs-body)",
                fontWeight: 600,
                lineHeight: 1.15,
                maxWidth: "100%",
                overflow: "hidden",
                overflowWrap: "break-word" as const,
                textAlign: "center" as const,
                display: "-webkit-box",
                WebkitBoxOrient: "vertical" as const,
                WebkitLineClamp: secondary ? 2 : 3,
              }
            : {
                fontSize: "var(--dg-fs-title)",
                fontWeight: 600,
                lineHeight: 1.2,
                maxWidth: "100%",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap" as const,
              }
        }
      >
        {primary}
      </span>
      {secondary ? (
        <span
          style={{
            fontSize: "var(--dg-fs-footnote)",
            fontWeight: 700,
            opacity: 0.82,
            lineHeight: isNameMode ? 1.15 : 1,
            maxWidth: "100%",
            overflow: "hidden",
            textOverflow: isNameMode ? undefined : "ellipsis",
            whiteSpace: isNameMode ? "normal" : "nowrap",
            overflowWrap: isNameMode ? ("break-word" as const) : undefined,
            textAlign: "center",
            display: isNameMode ? "-webkit-box" : undefined,
            WebkitBoxOrient: isNameMode ? ("vertical" as const) : undefined,
            WebkitLineClamp: isNameMode ? 2 : undefined,
          }}
        >
          {secondary}
        </span>
      ) : null}
    </div>
  );
}

function SectionBlock({
  title,
  description,
  summary,
  collapsible = false,
  defaultOpen = true,
  children,
}: {
  title: string;
  description?: string;
  summary?: string;
  collapsible?: boolean;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = React.useId();

  useEffect(() => {
    if (defaultOpen) {
      setOpen(true);
    }
  }, [defaultOpen]);

  const header = (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
      <div className="dg-type-content-group-heading">{title}</div>
      {description ? (
        <div
          style={{
            fontSize: "var(--dg-fs-caption)",
            color: "var(--dg-color-text-muted)",
            lineHeight: 1.5,
          }}
        >
          {description}
        </div>
      ) : null}
      {summary ? (
        <div style={{ fontSize: "var(--dg-fs-caption)", color: "var(--dg-color-text-faint)" }}>
          {summary}
        </div>
      ) : null}
    </div>
  );

  return (
    <div
      style={{
        padding: "14px 16px",
        borderRadius: "var(--dg-radius-md)",
        background: "var(--dg-color-surface)",
        border: "1px solid var(--dg-color-border-light)",
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      {collapsible ? (
        <Button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((current) => !current)}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            width: "100%",
            padding: 0,
            background: "transparent",
            border: "none",
            textAlign: "left",
          }}
        >
          {header}
          <span
            aria-hidden="true"
            style={{
              color: "var(--dg-color-text-primary)",
              transform: open ? "rotate(180deg)" : "none",
              transition: "transform 150ms ease",
            }}
          >
            ▾
          </span>
        </Button>
      ) : (
        header
      )}
      <div id={collapsible ? panelId : undefined} hidden={collapsible && !open}>
        {children}
      </div>
    </div>
  );
}

function ChecklistPanel({
  title,
  summary,
  items,
  selectedIds,
  onToggle,
  onToggleAll,
  disabled,
  emptyMessage,
}: {
  title: string;
  summary?: string;
  items: Array<{ id: number; label: string; description?: string }>;
  selectedIds: number[];
  onToggle: (id: number) => void;
  onToggleAll: () => void;
  disabled?: boolean;
  emptyMessage: string;
}) {
  const allSelected = items.length > 0 && selectedIds.length === items.length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <div style={{ ...labelStyle, marginBottom: 0 }}>{title}</div>
        {summary ? (
          <div
            style={{
              fontSize: "var(--dg-fs-caption)",
              color: "var(--dg-color-text-muted)",
              lineHeight: 1.4,
            }}
          >
            {summary}
          </div>
        ) : null}
      </div>

      {items.length === 0 ? (
        <div
          style={{
            padding: "12px 14px",
            borderRadius: "var(--dg-radius-sm)",
            border: "1px solid var(--dg-color-border-light)",
            color: "var(--dg-color-text-muted)",
            fontSize: "var(--dg-fs-label)",
            background: "var(--dg-color-bg-secondary)",
          }}
        >
          {emptyMessage}
        </div>
      ) : (
        <div className="dg-checklist">
          <label className="dg-checkbox-row dg-checkbox-row--header">
            <input
              type="checkbox"
              className="dg-checkbox"
              checked={allSelected}
              onChange={onToggleAll}
              disabled={disabled}
            />
            Select all
          </label>
          {items.map((item) => (
            <label key={item.id} className="dg-checkbox-row">
              <input
                type="checkbox"
                className="dg-checkbox"
                checked={selectedIds.includes(item.id)}
                onChange={() => onToggle(item.id)}
                disabled={disabled}
              />
              <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <span>{item.label}</span>
                {item.description ? (
                  <span
                    style={{
                      fontSize: "var(--dg-fs-caption)",
                      color: "var(--dg-color-text-muted)",
                      lineHeight: 1.35,
                    }}
                  >
                    {item.description}
                  </span>
                ) : null}
              </span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

function EligibilityModeToggle({
  value,
  disabled,
  dimmed,
  onChange,
}: {
  value: JobEligibilityMode;
  disabled?: boolean;
  dimmed?: boolean;
  onChange: (value: JobEligibilityMode) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <div style={{ ...labelStyle, marginBottom: 0 }}>Matching rule</div>
        <div
          style={{
            fontSize: "var(--dg-fs-caption)",
            color: "var(--dg-color-text-muted)",
            lineHeight: 1.35,
          }}
        >
          Decide whether staff must match both lists, or just one.
        </div>
      </div>
      <div
        style={{
          display: "inline-flex",
          borderRadius: "var(--dg-btn-radius)",
          border: "1px solid var(--dg-color-border)",
          overflow: "hidden",
          alignSelf: "flex-start",
          opacity: dimmed ? 0.65 : 1,
        }}
      >
        {(
          [
            ["and", "Require both"],
            ["or", "Allow either"],
          ] as const
        ).map(([mode, label]) => {
          const active = value === mode;
          return (
            <Button
              key={mode}
              type="button"
              onClick={() => onChange(mode)}
              disabled={disabled}
              style={{
                height: 34,
                padding: "0 12px",
                border: "none",
                background: active ? "var(--dg-color-bg-secondary)" : "var(--dg-color-surface)",
                color: active ? "var(--dg-color-text-primary)" : "var(--dg-color-text-secondary)",
                fontSize: "var(--dg-fs-label)",
                fontWeight: active ? 700 : 600,
                cursor: disabled ? "not-allowed" : "pointer",
              }}
            >
              {label}
            </Button>
          );
        })}
      </div>
    </div>
  );
}

function buildSectionHeaderText(section: JobSection): { title: string; description: string } {
  if (section === "defaultShift") {
    return {
      title: "Default Shift Job",
      description:
        "Configure shift-only assignments like Day Shift. The job is hidden on the grid but still controls placement, qualifications, times, and colors.",
    };
  }

  if (section === "shiftless") {
    return {
      title: "General Jobs",
      description:
        "Use this for work that appears on its own without a paired shift, like Office or Admin.",
    };
  }

  return {
    title: "Scheduled Jobs",
    description:
      "Choose departments first, narrow to focus areas, then define exactly how the job behaves on each selected shift.",
  };
}

function DefaultShiftToggle({
  organization,
  onOrganizationSave,
  disabled,
}: {
  organization: Organization;
  onOrganizationSave: (o: Organization) => void;
  disabled: boolean;
}) {
  const [enabled, setEnabled] = useState(organization.defaultShiftEnabled);
  const [saving, setSaving] = useState(false);
  const [pendingValue, setPendingValue] = useState<boolean | null>(null);

  useEffect(() => {
    setEnabled(organization.defaultShiftEnabled);
  }, [organization.defaultShiftEnabled]);

  const handleConfirm = useCallback(async () => {
    if (pendingValue === null) return;
    const next = pendingValue;

    if (!organization.updatedAt) {
      toast.error("Organization data is out of date. Refresh and try again.");
      setPendingValue(null);
      return;
    }

    setSaving(true);
    try {
      const result = await saveOrganizationSettingsWithRecovery({
        baseline: organization,
        input: {
          orgId: organization.id,
          expectedUpdatedAt: organization.updatedAt,
          defaultShiftEnabled: next,
        },
      });
      setEnabled(result.organization.defaultShiftEnabled);
      onOrganizationSave(result.organization);
      toast[result.status === "saved" ? "success" : "info"](
        result.status === "saved"
          ? next
            ? "Shift-only assignments enabled"
            : "Shift-only assignments disabled"
          : "This setting was refreshed to the latest saved value.",
      );
    } catch (err) {
      toast.error("We couldn't save that setting. Try again.");
    } finally {
      setSaving(false);
      setPendingValue(null);
    }
  }, [pendingValue, organization.id, organization.updatedAt, onOrganizationSave]);

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ textAlign: "right" }}>
          <div
            style={{
              fontSize: "var(--dg-fs-caption)",
              fontWeight: 600,
              color: "var(--dg-color-text-secondary)",
            }}
          >
            Shift-only assignments
          </div>
          <div style={{ fontSize: "var(--dg-fs-caption)", color: "var(--dg-color-text-muted)" }}>
            Let staff be scheduled with just a shift, no job attached
          </div>
        </div>
        <Switch
          checked={enabled}
          onChange={(next) => setPendingValue(next)}
          disabled={disabled || saving}
          ariaLabel="Shift-only assignments"
        />
      </div>
      {pendingValue !== null ? (
        <ConfirmDialog
          title={
            pendingValue ? "Enable shift-only assignments?" : "Disable shift-only assignments?"
          }
          message={
            pendingValue ? (
              <>
                Staff can be scheduled with just a shift, no job attached. The{" "}
                <strong>Default Shift Job</strong> appears in Jobs settings.
              </>
            ) : (
              <>
                Staff can no longer be scheduled with just a shift going forward, and the{" "}
                <strong>Default Shift Job</strong> is hidden from Jobs settings. Shifts and coverage
                requirements that already use it keep working as before.
              </>
            )
          }
          confirmLabel={pendingValue ? "Enable" : "Disable"}
          variant={pendingValue ? "info" : "warning"}
          isLoading={saving}
          onConfirm={() => handleConfirm()}
          onCancel={() => setPendingValue(null)}
        />
      ) : null}
    </>
  );
}

function JobSectionCard({
  section,
  rows,
  canManageScheduleDefinitions,
  onAdd,
  hideAddButton = false,
  headerAction,
  children,
}: {
  section: JobSection;
  rows: Array<JobDefinition & { isNew?: boolean }>;
  canManageScheduleDefinitions: boolean;
  onAdd: () => void;
  hideAddButton?: boolean;
  headerAction?: React.ReactNode;
  children: React.ReactNode;
}) {
  const header = buildSectionHeaderText(section);

  return (
    <div
      style={{
        background: "var(--dg-color-surface)",
        borderRadius: "var(--dg-radius-md)",
        border: "1px solid var(--dg-color-border)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "12px 16px",
          borderBottom: "1px solid var(--dg-color-border-light)",
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 16,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <div
            style={{
              fontWeight: 700,
              fontSize: "var(--dg-fs-label)",
              color: "var(--dg-color-text-secondary)",
            }}
          >
            {header.title}
          </div>
          <div
            style={{
              fontSize: "var(--dg-fs-caption)",
              color: "var(--dg-color-text-muted)",
              lineHeight: 1.45,
            }}
          >
            {header.description}
          </div>
        </div>
        {headerAction ? <div style={{ flexShrink: 0 }}>{headerAction}</div> : null}
      </div>

      {rows.length > 0 ? (
        <div style={{ padding: "0 16px" }}>{children}</div>
      ) : (
        <EmptyState
          size="compact"
          title={section === "shiftless" ? "No general jobs yet" : "No scheduled jobs yet"}
          description={
            section === "shiftless"
              ? "Create shiftless jobs for work that should appear without a Day, Evening, or Night shift."
              : "Create jobs that start with scheduled departments, then narrow to the focus areas and shifts where they apply."
          }
          action={
            canManageScheduleDefinitions ? (
              <Button onClick={onAdd} className="dg-btn dg-btn-secondary dg-btn-sm">
                {section === "shiftless" ? "+ Add General Job" : "+ Add Scheduled Job"}
              </Button>
            ) : undefined
          }
          style={{ margin: "12px 16px" }}
        />
      )}

      {rows.length > 0 && canManageScheduleDefinitions ? (
        !hideAddButton ? (
          <div style={{ padding: "8px 16px 12px" }}>
            <Button
              onClick={onAdd}
              className="dg-btn dg-btn-dashed dg-btn-sm"
              style={{ width: "100%" }}
            >
              {section === "shiftless" ? "+ Add General Job" : "+ Add Scheduled Job"}
            </Button>
          </div>
        ) : null
      ) : null}
    </div>
  );
}

function JobRow({
  job,
  section,
  orgId,
  roleLabel,
  certificationLabel,
  scheduleRoles,
  certifications,
  departments,
  focusAreas,
  shiftCategories,
  onSaved,
  onDeleted,
  canManageScheduleDefinitions,
  allJobs,
  shiftDisplayMode,
  isLast,
}: {
  job: JobDefinition & { isNew?: boolean };
  section: JobSection;
  orgId: string;
  roleLabel: string;
  certificationLabel: string;
  scheduleRoles: NamedItem[];
  certifications: NamedItem[];
  departments: Department[];
  focusAreas: FocusArea[];
  shiftCategories: ShiftCategory[];
  onSaved: (saved: JobDefinition, previousId: number) => void;
  onDeleted: (id: number) => void;
  canManageScheduleDefinitions: boolean;
  allJobs: Array<JobDefinition & { isNew?: boolean }>;
  shiftDisplayMode: ShiftDisplayMode;
  isLast?: boolean;
}) {
  const isMobile = useMediaQuery(MOBILE);
  const isNameMode = shiftDisplayMode === "name";
  const isRegularStaffJob = isRegularStaffSystemJob(job);
  const isDefaultShiftJob = section === "defaultShift" || isDefaultShiftSystemJob(job);
  const isLockedIdentityJob = isProtectedSystemJob(job) || isDefaultShiftJob;
  const [form, setForm] = useState<JobFormState>(() =>
    buildJobFormState(job, shiftCategories, focusAreas),
  );
  const [expanded, setExpanded] = useState(!!job.isNew && !isDefaultShiftJob);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [dependencyInfo, setDependencyInfo] = useState<DependencyInfo | null>(null);

  useEffect(() => {
    if (!job.isNew) {
      setForm(buildJobFormState(job, shiftCategories, focusAreas));
    }
  }, [focusAreas, job, shiftCategories]);

  const activeScheduledDepartments = useMemo(
    () =>
      sortByOrder(
        departments.filter(
          (department) => !department.archivedAt && department.type === "scheduled",
        ),
      ),
    [departments],
  );
  const activeFocusAreas = useMemo(
    () => sortByOrder(focusAreas.filter((focusArea) => !focusArea.archivedAt)),
    [focusAreas],
  );
  const activeShifts = useMemo(
    () => sortByOrder(shiftCategories.filter((shift) => !shift.archivedAt)),
    [shiftCategories],
  );
  const focusAreaNameById = useMemo(
    () => new Map(activeFocusAreas.map((focusArea) => [focusArea.id, focusArea.name])),
    [activeFocusAreas],
  );
  const focusAreasInSelectedDepartments = useMemo(
    () =>
      activeFocusAreas.filter(
        (focusArea) =>
          focusArea.departmentId != null && form.departmentIds.includes(focusArea.departmentId),
      ),
    [activeFocusAreas, form.departmentIds],
  );
  const availableFocusAreaIds = useMemo(
    () => focusAreasInSelectedDepartments.map((focusArea) => focusArea.id),
    [focusAreasInSelectedDepartments],
  );
  const availableShifts = useMemo(
    () =>
      activeShifts.filter(
        (shift) => shift.focusAreaId != null && form.focusAreaIds.includes(shift.focusAreaId),
      ),
    [activeShifts, form.focusAreaIds],
  );
  const shiftNameCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const shift of availableShifts) {
      counts.set(shift.name, (counts.get(shift.name) ?? 0) + 1);
    }
    return counts;
  }, [availableShifts]);
  const shiftLabelById = useMemo(
    () =>
      new Map(
        activeShifts.map((shift) => {
          const focusAreaName =
            shift.focusAreaId != null ? focusAreaNameById.get(shift.focusAreaId) : null;
          const shouldPrefix = focusAreaName != null && (shiftNameCounts.get(shift.name) ?? 0) > 1;
          return [shift.id, shouldPrefix ? `${focusAreaName} · ${shift.name}` : shift.name];
        }),
      ),
    [activeShifts, focusAreaNameById, shiftNameCounts],
  );
  const selectedShifts = useMemo(
    () => availableShifts.filter((shift) => form.applicableShiftIds.includes(shift.id)),
    [availableShifts, form.applicableShiftIds],
  );

  const normalizedShiftTimeOverrides = useMemo(
    () => normalizeShiftTimeOverrides(form.shiftTimeOverrides),
    [form.shiftTimeOverrides],
  );
  const normalizedShiftColorOverrides = useMemo(
    () => normalizeShiftColorOverrides(form.shiftColorOverrides),
    [form.shiftColorOverrides],
  );
  const normalizedShiftlessTiming = useMemo(
    () =>
      normalizeShiftlessJobTiming({
        assignmentMode: section === "shiftless" ? "shiftless" : "with_shift",
        defaultStartTime: form.defaultStartTime,
        defaultEndTime: form.defaultEndTime,
        defaultDurationHours: form.defaultDurationHours,
        defaultDurationMinutes: form.defaultDurationMinutes,
      }),
    [
      form.defaultDurationHours,
      form.defaultDurationMinutes,
      form.defaultEndTime,
      form.defaultStartTime,
      section,
    ],
  );
  const hasGeneralJobFixedTime =
    section === "shiftless" &&
    (normalizedShiftlessTiming.defaultStartTime != null ||
      normalizedShiftlessTiming.defaultEndTime != null);
  const hasGeneralJobDuration =
    section === "shiftless" &&
    (normalizedShiftlessTiming.defaultDurationHours != null ||
      normalizedShiftlessTiming.defaultDurationMinutes != null);
  const incompleteGeneralJobTime =
    section === "shiftless" &&
    (normalizedShiftlessTiming.defaultStartTime == null) !==
      (normalizedShiftlessTiming.defaultEndTime == null);
  const incompleteShiftOverride = useMemo(
    () =>
      selectedShifts.some((shift) => {
        const override = normalizedShiftTimeOverrides[String(shift.id)];
        return override != null && (!override.startTime || !override.endTime);
      }),
    [normalizedShiftTimeOverrides, selectedShifts],
  );

  const initialSerialized = serializeJobFormState(
    buildJobFormState(job, shiftCategories, focusAreas),
    section,
  );
  const currentSerialized = serializeJobFormState(form, section);
  const isDirty = job.isNew || initialSerialized !== currentSerialized;
  const normalizedName = form.name.trim().toLowerCase();
  const normalizedAbbr = form.abbr.trim().toUpperCase();
  const nameError =
    form.name.trim().length > 0
      ? getLineTextError(form.name, {
          label: "Job name",
          maxLength: 50,
          required: true,
          disallowUrl: true,
        })
      : null;
  const abbrError =
    !isNameMode && form.abbr.trim().length > 0
      ? getCodeError(form.abbr, {
          label: "Job abbreviation",
          maxLength: 6,
          required: true,
          uppercase: true,
        })
      : null;
  const duplicateName =
    !isLockedIdentityJob &&
    normalizedName.length > 0 &&
    allJobs.some(
      (candidate) =>
        candidate.id !== job.id && candidate.name.trim().toLowerCase() === normalizedName,
    );
  const duplicateAbbr =
    !isNameMode &&
    !isLockedIdentityJob &&
    normalizedAbbr.length > 0 &&
    allJobs.some(
      (candidate) =>
        candidate.id !== job.id && candidate.abbr.trim().toUpperCase() === normalizedAbbr,
    );

  const hasRequiredPlacement =
    section === "shiftless" ||
    (form.departmentIds.length > 0 &&
      form.focusAreaIds.length > 0 &&
      form.applicableShiftIds.length > 0);
  const canSave =
    isDirty &&
    !!form.name.trim() &&
    (isNameMode || !!form.abbr.trim()) &&
    !nameError &&
    !abbrError &&
    !duplicateName &&
    !duplicateAbbr &&
    !incompleteGeneralJobTime &&
    !incompleteShiftOverride &&
    hasRequiredPlacement;

  const resetDraft = useCallback(() => {
    setForm(buildJobFormState(job, shiftCategories, focusAreas));
  }, [focusAreas, job, shiftCategories]);

  const discardDraft = useCallback(
    (closeAfter: boolean) => {
      if (job.isNew && closeAfter) {
        onDeleted(job.id);
        return;
      }
      resetDraft();
      if (closeAfter) {
        setExpanded(false);
      }
    },
    [job.id, job.isNew, onDeleted, resetDraft],
  );

  const closeEditor = useCallback(() => {
    if (job.isNew) {
      onDeleted(job.id);
      return;
    }
    setExpanded(false);
  }, [job.id, job.isNew, onDeleted]);

  const { requestClose, unsavedChangesDialog } = useUnsavedChangesPrompt({
    hasUnsavedChanges: expanded && isDirty,
    onDiscard: () => discardDraft(true),
  });

  const trimSelectionToPlacement = useCallback(
    (nextDepartmentIds: number[], nextFocusAreaIds: number[]) => {
      const validFocusAreaIds = activeFocusAreas
        .filter(
          (focusArea) =>
            focusArea.departmentId != null && nextDepartmentIds.includes(focusArea.departmentId),
        )
        .map((focusArea) => focusArea.id);
      const trimmedFocusAreaIds = nextFocusAreaIds.filter((focusAreaId) =>
        validFocusAreaIds.includes(focusAreaId),
      );
      const validShiftIds = activeShifts
        .filter(
          (shift) => shift.focusAreaId != null && trimmedFocusAreaIds.includes(shift.focusAreaId),
        )
        .map((shift) => shift.id);

      return {
        focusAreaIds: trimmedFocusAreaIds,
        applicableShiftIds: form.applicableShiftIds.filter((shiftId) =>
          validShiftIds.includes(shiftId),
        ),
        shiftTimeOverrides: Object.fromEntries(
          Object.entries(normalizeShiftTimeOverrides(form.shiftTimeOverrides)).filter(([shiftId]) =>
            validShiftIds.includes(Number(shiftId)),
          ),
        ),
        shiftColorOverrides: Object.fromEntries(
          Object.entries(normalizeShiftColorOverrides(form.shiftColorOverrides)).filter(
            ([shiftId]) => validShiftIds.includes(Number(shiftId)),
          ),
        ),
      };
    },
    [
      activeFocusAreas,
      activeShifts,
      form.applicableShiftIds,
      form.shiftColorOverrides,
      form.shiftTimeOverrides,
    ],
  );

  const handleSave = useCallback(async () => {
    if (!canSave) return;

    setSaving(true);
    try {
      const timingDefaults = normalizeShiftlessJobTiming({
        assignmentMode: section === "shiftless" ? "shiftless" : "with_shift",
        defaultStartTime: form.defaultStartTime,
        defaultEndTime: form.defaultEndTime,
        defaultDurationHours: form.defaultDurationHours,
        defaultDurationMinutes: form.defaultDurationMinutes,
      });
      const saved = await upsertJobDefinition({
        id: job.isNew ? undefined : job.id,
        orgId,
        name: isDefaultShiftJob
          ? DEFAULT_SHIFT_JOB_NAME
          : normalizeLineText(form.name, {
              label: "Job name",
              maxLength: 50,
              required: true,
              disallowUrl: true,
            }),
        abbr: isDefaultShiftJob
          ? DEFAULT_SHIFT_JOB_ABBR
          : isNameMode
            ? form.abbr.trim() || deriveJobAbbreviation(form.name)
            : normalizeCode(form.abbr, {
                label: "Job abbreviation",
                maxLength: 6,
                required: true,
                uppercase: true,
              }),
        showOnGrid: isLockedIdentityJob ? false : true,
        assignmentMode: section === "shiftless" ? "shiftless" : "with_shift",
        eligibilityMode: form.eligibilityMode,
        focusAreaIds: isScheduledLikeSection(section) ? [...form.focusAreaIds] : [],
        departmentIds: isScheduledLikeSection(section) ? [...form.departmentIds] : [],
        applicableShiftIds: isScheduledLikeSection(section) ? [...form.applicableShiftIds] : [],
        eligibleRoleIds: [...form.eligibleRoleIds],
        requiredCertificationIds: [...form.requiredCertificationIds],
        color: section === "shiftless" ? form.color : EMPTY_SCHEDULED_JOB_STYLE.color,
        border: section === "shiftless" ? form.border : EMPTY_SCHEDULED_JOB_STYLE.border,
        text: section === "shiftless" ? form.text : EMPTY_SCHEDULED_JOB_STYLE.text,
        shiftTimeOverrides: isScheduledLikeSection(section) ? normalizedShiftTimeOverrides : {},
        shiftColorOverrides: isScheduledLikeSection(section) ? normalizedShiftColorOverrides : {},
        defaultStartTime: section === "shiftless" ? timingDefaults.defaultStartTime : null,
        defaultEndTime: section === "shiftless" ? timingDefaults.defaultEndTime : null,
        defaultDurationHours: section === "shiftless" ? timingDefaults.defaultDurationHours : null,
        defaultDurationMinutes:
          section === "shiftless" ? timingDefaults.defaultDurationMinutes : null,
        sortOrder: job.sortOrder,
        systemKey: isDefaultShiftJob ? DEFAULT_SHIFT_JOB_SYSTEM_KEY : (job.systemKey ?? null),
      });
      onSaved(saved, job.id);
      setExpanded(false);
      toast.success("Job saved");
    } catch (error) {
      Sentry.captureException(error);
      toast.error(formatClientErrorMessage(error, "We couldn't save that job."));
    } finally {
      setSaving(false);
    }
  }, [
    canSave,
    form,
    isDefaultShiftJob,
    isLockedIdentityJob,
    job.id,
    job.isNew,
    job.sortOrder,
    job.systemKey,
    normalizedShiftColorOverrides,
    normalizedShiftTimeOverrides,
    onSaved,
    orgId,
    section,
  ]);

  const handleDeleteClick = useCallback(async () => {
    if (job.isNew) {
      onDeleted(job.id);
      return;
    }
    const deps = await checkJobDependencies(job.id, orgId);
    setDependencyInfo(deps);
    setShowDeleteConfirm(true);
  }, [job.id, job.isNew, onDeleted, orgId]);

  const handleDelete = useCallback(
    async (hard: boolean) => {
      setDeleting(true);
      try {
        await deleteJobDefinition(job.id, orgId, hard);
        onDeleted(job.id);
        toast.success(hard ? "Job deleted" : "Job archived");
      } catch (error) {
        Sentry.captureException(error);
        toast.error(hard ? "Failed to delete job" : "Failed to archive job");
      } finally {
        setDeleting(false);
        setShowDeleteConfirm(false);
      }
    },
    [job.id, onDeleted, orgId],
  );

  const toggleExpanded = useCallback(() => {
    if (!expanded) {
      setExpanded(true);
      return;
    }
    if (isDirty) {
      requestClose();
      return;
    }
    closeEditor();
  }, [closeEditor, expanded, isDirty, requestClose]);

  const placementSummary = isDefaultShiftJob
    ? `Shift-only: ${form.departmentIds.length} dept · ${form.focusAreaIds.length} area · ${form.applicableShiftIds.length} shift`
    : section === "shiftless"
      ? "General / no shift"
      : `${formatCount(form.departmentIds.length, "department")} · ${formatCount(form.focusAreaIds.length, "focus area")} · ${formatCount(form.applicableShiftIds.length, "shift")}`;

  const eligibleRoleSummary =
    form.eligibleRoleIds.length === 0
      ? `Any schedule-eligible ${roleLabel.toLowerCase()}`
      : `${formatCount(form.eligibleRoleIds.length, roleLabel.toLowerCase())} selected`;
  const certificationSummary =
    form.requiredCertificationIds.length === 0
      ? `Any ${certificationLabel.toLowerCase()}`
      : `${formatCount(form.requiredCertificationIds.length, certificationLabel.toLowerCase())} selected`;
  const eligibilityModeDimmed =
    form.eligibleRoleIds.length === 0 || form.requiredCertificationIds.length === 0;
  const overrideCount =
    Object.keys(form.shiftColorOverrides).length + Object.keys(form.shiftTimeOverrides).length;
  const perShiftSettingsSummary =
    form.applicableShiftIds.length === 0
      ? "Select shifts in Placement first."
      : overrideCount === 0
        ? "Using each selected shift's defaults."
        : `${formatCount(overrideCount, "override")} configured`;
  const editorId = React.useId();

  return (
    <div
      className="dg-list-row"
      style={{
        borderBottom: expanded || isLast ? "none" : "1px solid var(--dg-color-border-light)",
      }}
    >
      <Button
        type="button"
        className="dg-hover-row"
        aria-expanded={expanded}
        aria-controls={editorId}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "10px 8px",
          borderRadius: "var(--dg-radius-md)",
          cursor: "pointer",
          transition: "background 0.15s",
          width: "100%",
          background: "transparent",
          border: "none",
          textAlign: "left",
        }}
        onClick={toggleExpanded}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: "var(--dg-fs-body)",
              fontWeight: 600,
              color: "var(--dg-color-text-primary)",
            }}
          >
            {form.name || "Untitled job"}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 3 }}>
            <span style={{ fontSize: "var(--dg-fs-caption)", color: "var(--dg-color-text-muted)" }}>
              {placementSummary}
            </span>
            {isLockedIdentityJob ? (
              <span style={{ fontSize: "var(--dg-fs-caption)", color: "var(--dg-color-brand)" }}>
                {isDefaultShiftJob ? "Shift-only" : "System default"}
              </span>
            ) : null}
          </div>
        </div>

        <span
          style={{
            fontSize: "var(--dg-fs-body-sm)",
            color: "var(--dg-color-text-primary)",
            transform: expanded ? "rotate(180deg)" : "none",
            transition: "transform 150ms ease",
          }}
        >
          ▾
        </span>
      </Button>

      {expanded ? (
        <div
          id={editorId}
          style={{
            background: "var(--dg-color-bg-secondary)",
            borderRadius: "var(--dg-radius-lg)",
            border: "1px solid var(--dg-color-border-light)",
            margin: "0 0 8px",
            padding: "14px 16px",
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
          onClick={(event) => event.stopPropagation()}
        >
          <SectionBlock
            title="Basics"
            description={
              isDefaultShiftJob
                ? isNameMode
                  ? "Use this row for assignments that should display as the shift only."
                  : "Use this row for assignments that should display as the shift only, like D or Day Shift."
                : section === "scheduled"
                  ? "Name the job once, then configure exactly how it behaves on the selected shifts."
                  : "Use shiftless jobs for work that stands on its own without a scheduled shift."
            }
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: isNameMode || isMobile ? "1fr" : "minmax(0, 1fr) 150px",
                  gap: 10,
                }}
              >
                <div>
                  <label style={labelStyle}>Job name</label>
                  <input
                    value={form.name}
                    onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                    placeholder={section === "shiftless" ? "e.g. Office" : "e.g. Supervisor"}
                    className="dg-input"
                    maxLength={50}
                    disabled={!canManageScheduleDefinitions || isLockedIdentityJob}
                    style={nameError ? { borderColor: "var(--dg-color-danger)" } : undefined}
                  />
                  {nameError ? (
                    <p
                      role="alert"
                      style={{
                        margin: "4px 0 0",
                        fontSize: "var(--dg-fs-footnote)",
                        color: "var(--dg-color-danger)",
                      }}
                    >
                      {nameError}
                    </p>
                  ) : null}
                </div>
                {!isNameMode && (
                  <div>
                    <label style={labelStyle}>Grid abbreviation</label>
                    <input
                      value={form.abbr}
                      onChange={(event) =>
                        setForm((prev) => ({ ...prev, abbr: event.target.value }))
                      }
                      placeholder={section === "shiftless" ? "e.g. OFC" : "e.g. SUP"}
                      className="dg-input"
                      maxLength={6}
                      disabled={!canManageScheduleDefinitions || isLockedIdentityJob}
                      style={abbrError ? { borderColor: "var(--dg-color-danger)" } : undefined}
                    />
                    {abbrError ? (
                      <p
                        role="alert"
                        style={{
                          margin: "4px 0 0",
                          fontSize: "var(--dg-fs-footnote)",
                          color: "var(--dg-color-danger)",
                        }}
                      >
                        {abbrError}
                      </p>
                    ) : null}
                  </div>
                )}
              </div>

              {section === "shiftless" ? (
                <div
                  data-job-timing-layout
                  style={{
                    display: "grid",
                    gridTemplateColumns: isMobile ? "1fr" : "minmax(220px, 280px) minmax(0, 520px)",
                    gap: isMobile ? 16 : 24,
                    alignItems: "start",
                  }}
                >
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <label style={labelStyle}>Color preset</label>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <PresetColorPicker
                        valueBg={form.color}
                        onChange={(color) =>
                          setForm((prev) => ({
                            ...prev,
                            color: color.bg,
                            text: color.text,
                            border: TRANSPARENT_BORDER,
                          }))
                        }
                        disabled={!canManageScheduleDefinitions}
                      />
                      <ShiftPreviewPill
                        primary={getJobPreviewLabel({
                          jobName: form.name,
                          jobAbbr: form.abbr,
                          shiftDisplayMode: "name",
                        })}
                        bg={form.color}
                        mode="name"
                      />
                    </div>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {hasGeneralJobDuration ? (
                      <>
                        <label style={labelStyle}>Default duration</label>
                        <div
                          style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 4 }}
                        >
                          <NumberField
                            nullable
                            aria-label="Default duration hours"
                            min={0}
                            max={23}
                            value={normalizedShiftlessTiming.defaultDurationHours}
                            onChange={(value) =>
                              setForm((prev) => ({
                                ...prev,
                                defaultStartTime: null,
                                defaultEndTime: null,
                                defaultDurationHours: value,
                              }))
                            }
                            style={{ width: 72 }}
                            disabled={!canManageScheduleDefinitions}
                          />
                          <span
                            style={{
                              fontSize: "var(--dg-fs-label)",
                              color: "var(--dg-color-text-muted)",
                            }}
                          >
                            h
                          </span>
                          <NumberField
                            nullable
                            aria-label="Default duration minutes"
                            min={0}
                            max={59}
                            value={normalizedShiftlessTiming.defaultDurationMinutes}
                            onChange={(value) =>
                              setForm((prev) => ({
                                ...prev,
                                defaultStartTime: null,
                                defaultEndTime: null,
                                defaultDurationMinutes: value,
                              }))
                            }
                            style={{ width: 72 }}
                            disabled={!canManageScheduleDefinitions}
                          />
                          <span
                            style={{
                              fontSize: "var(--dg-fs-label)",
                              color: "var(--dg-color-text-muted)",
                            }}
                          >
                            m
                          </span>
                        </div>
                        <p
                          style={{
                            margin: 0,
                            fontSize: "var(--dg-fs-caption)",
                            color: "var(--dg-color-text-muted)",
                            lineHeight: 1.45,
                          }}
                        >
                          Use a duration when this general job should stay untethered from a fixed
                          start and end time.
                        </p>
                        {canManageScheduleDefinitions ? (
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                            <Button
                              type="button"
                              className="dg-btn dg-btn-secondary dg-btn-sm"
                              onClick={() =>
                                setForm((prev) => ({
                                  ...prev,
                                  defaultDurationHours: null,
                                  defaultDurationMinutes: null,
                                }))
                              }
                            >
                              Remove duration
                            </Button>
                            <Button
                              type="button"
                              className="dg-btn dg-btn-secondary dg-btn-sm"
                              onClick={() =>
                                setForm((prev) => ({
                                  ...prev,
                                  defaultStartTime: "07:00",
                                  defaultEndTime: "15:00",
                                  defaultDurationHours: null,
                                  defaultDurationMinutes: null,
                                }))
                              }
                            >
                              Set actual times instead
                            </Button>
                          </div>
                        ) : null}
                      </>
                    ) : hasGeneralJobFixedTime ? (
                      <>
                        <label style={labelStyle}>Default start / end</label>
                        <div
                          style={{
                            display: "flex",
                            gap: 8,
                            alignItems: "center",
                            flexWrap: "wrap",
                          }}
                        >
                          <TimeInput12h
                            value={normalizedShiftlessTiming.defaultStartTime}
                            onChange={(value) =>
                              setForm((prev) => ({
                                ...prev,
                                defaultStartTime: value,
                                defaultDurationHours: null,
                                defaultDurationMinutes: null,
                              }))
                            }
                            disabled={!canManageScheduleDefinitions}
                          />
                          <span
                            style={{
                              fontSize: "var(--dg-fs-label)",
                              color: "var(--dg-color-text-muted)",
                            }}
                          >
                            to
                          </span>
                          <TimeInput12h
                            value={normalizedShiftlessTiming.defaultEndTime}
                            onChange={(value) =>
                              setForm((prev) => ({
                                ...prev,
                                defaultEndTime: value,
                                defaultDurationHours: null,
                                defaultDurationMinutes: null,
                              }))
                            }
                            disabled={!canManageScheduleDefinitions}
                          />
                        </div>
                        {calcTimeDuration(
                          normalizedShiftlessTiming.defaultStartTime,
                          normalizedShiftlessTiming.defaultEndTime,
                        ) ? (
                          <div
                            style={{
                              fontSize: "var(--dg-fs-caption)",
                              color: "var(--dg-color-text-muted)",
                            }}
                          >
                            Duration:{" "}
                            <span
                              style={{ fontWeight: 600, color: "var(--dg-color-text-secondary)" }}
                            >
                              {calcTimeDuration(
                                normalizedShiftlessTiming.defaultStartTime,
                                normalizedShiftlessTiming.defaultEndTime,
                              )}
                            </span>
                          </div>
                        ) : null}
                        <p
                          style={{
                            margin: 0,
                            fontSize: "var(--dg-fs-caption)",
                            color: "var(--dg-color-text-muted)",
                            lineHeight: 1.45,
                          }}
                        >
                          Fixed times take priority over duration for general jobs, so only one
                          timing mode can be saved at once.
                        </p>
                        {canManageScheduleDefinitions ? (
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                            <Button
                              type="button"
                              className="dg-btn dg-btn-secondary dg-btn-sm"
                              onClick={() =>
                                setForm((prev) => ({
                                  ...prev,
                                  defaultStartTime: null,
                                  defaultEndTime: null,
                                }))
                              }
                            >
                              Remove default time
                            </Button>
                            <Button
                              type="button"
                              className="dg-btn dg-btn-secondary dg-btn-sm"
                              onClick={() =>
                                setForm((prev) => ({
                                  ...prev,
                                  defaultStartTime: null,
                                  defaultEndTime: null,
                                  defaultDurationHours: 0,
                                  defaultDurationMinutes: 0,
                                }))
                              }
                            >
                              Use duration instead
                            </Button>
                          </div>
                        ) : null}
                      </>
                    ) : (
                      <>
                        <label style={labelStyle}>Default timing</label>
                        <p
                          style={{
                            margin: 0,
                            fontSize: "var(--dg-fs-caption)",
                            color: "var(--dg-color-text-muted)",
                            lineHeight: 1.45,
                          }}
                        >
                          Choose one timing mode for general jobs. Use either a fixed start and end
                          time or a duration.
                        </p>
                        {canManageScheduleDefinitions ? (
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                            <Button
                              type="button"
                              className="dg-btn dg-btn-secondary dg-btn-sm"
                              onClick={() =>
                                setForm((prev) => ({
                                  ...prev,
                                  defaultStartTime: "07:00",
                                  defaultEndTime: "15:00",
                                  defaultDurationHours: null,
                                  defaultDurationMinutes: null,
                                }))
                              }
                            >
                              Set actual times
                            </Button>
                            <Button
                              type="button"
                              className="dg-btn dg-btn-secondary dg-btn-sm"
                              onClick={() =>
                                setForm((prev) => ({
                                  ...prev,
                                  defaultStartTime: null,
                                  defaultEndTime: null,
                                  defaultDurationHours: 0,
                                  defaultDurationMinutes: 0,
                                }))
                              }
                            >
                              Set duration instead
                            </Button>
                          </div>
                        ) : (
                          <div
                            style={{
                              fontSize: "var(--dg-fs-caption)",
                              color: "var(--dg-color-text-muted)",
                            }}
                          >
                            No default time or duration is set.
                          </div>
                        )}
                      </>
                    )}
                    {normalizedShiftlessTiming.defaultStartTime != null &&
                    normalizedShiftlessTiming.defaultEndTime != null ? (
                      <div
                        style={{
                          fontSize: "var(--dg-fs-caption)",
                          color: "var(--dg-color-text-muted)",
                        }}
                      >
                        {fmt12h(normalizedShiftlessTiming.defaultStartTime)} to{" "}
                        {fmt12h(normalizedShiftlessTiming.defaultEndTime)}
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>
          </SectionBlock>

          {isScheduledLikeSection(section) ? (
            <SectionBlock
              title="Placement"
              description="Choose the scheduled departments first. Then select the focus areas inside them and the shifts where this job applies."
              summary={placementSummary}
              collapsible
              defaultOpen={form.departmentIds.length === 0}
            >
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: isMobile ? "1fr" : "repeat(3, minmax(0, 1fr))",
                  gap: 12,
                }}
              >
                <ChecklistPanel
                  title="Scheduled departments"
                  summary={
                    form.departmentIds.length === 0
                      ? "Choose where this job can exist."
                      : `${formatCount(form.departmentIds.length, "department")} selected`
                  }
                  items={activeScheduledDepartments.map((department) => ({
                    id: department.id,
                    label: department.name,
                  }))}
                  selectedIds={form.departmentIds}
                  onToggle={(departmentId) =>
                    setForm((prev) => {
                      const nextDepartmentIds = prev.departmentIds.includes(departmentId)
                        ? prev.departmentIds.filter((value) => value !== departmentId)
                        : [...prev.departmentIds, departmentId];
                      const trimmed = trimSelectionToPlacement(
                        nextDepartmentIds,
                        prev.focusAreaIds,
                      );
                      return {
                        ...prev,
                        departmentIds: nextDepartmentIds,
                        focusAreaIds: trimmed.focusAreaIds,
                        applicableShiftIds: trimmed.applicableShiftIds,
                        shiftTimeOverrides: trimmed.shiftTimeOverrides,
                        shiftColorOverrides: trimmed.shiftColorOverrides,
                      };
                    })
                  }
                  onToggleAll={() =>
                    setForm((prev) => {
                      const nextDepartmentIds =
                        prev.departmentIds.length === activeScheduledDepartments.length
                          ? []
                          : activeScheduledDepartments.map((department) => department.id);
                      const trimmed = trimSelectionToPlacement(
                        nextDepartmentIds,
                        prev.focusAreaIds,
                      );
                      return {
                        ...prev,
                        departmentIds: nextDepartmentIds,
                        focusAreaIds: trimmed.focusAreaIds,
                        applicableShiftIds: trimmed.applicableShiftIds,
                        shiftTimeOverrides: trimmed.shiftTimeOverrides,
                        shiftColorOverrides: trimmed.shiftColorOverrides,
                      };
                    })
                  }
                  disabled={!canManageScheduleDefinitions || isRegularStaffJob}
                  emptyMessage="No scheduled departments exist yet."
                />

                <ChecklistPanel
                  title="Focus areas"
                  summary={
                    form.departmentIds.length === 0
                      ? "Select departments first."
                      : form.focusAreaIds.length === 0
                        ? "Choose the focus areas where this job can be assigned."
                        : `${formatCount(form.focusAreaIds.length, "focus area")} selected`
                  }
                  items={focusAreasInSelectedDepartments.map((focusArea) => ({
                    id: focusArea.id,
                    label: focusArea.name,
                  }))}
                  selectedIds={form.focusAreaIds}
                  onToggle={(focusAreaId) =>
                    setForm((prev) => {
                      const nextFocusAreaIds = prev.focusAreaIds.includes(focusAreaId)
                        ? prev.focusAreaIds.filter((value) => value !== focusAreaId)
                        : [...prev.focusAreaIds, focusAreaId];
                      const nextShiftIds = activeShifts
                        .filter(
                          (shift) =>
                            shift.focusAreaId != null &&
                            nextFocusAreaIds.includes(shift.focusAreaId),
                        )
                        .map((shift) => shift.id);
                      return {
                        ...prev,
                        focusAreaIds: nextFocusAreaIds,
                        applicableShiftIds: prev.applicableShiftIds.filter((shiftId) =>
                          nextShiftIds.includes(shiftId),
                        ),
                        shiftTimeOverrides: Object.fromEntries(
                          Object.entries(
                            normalizeShiftTimeOverrides(prev.shiftTimeOverrides),
                          ).filter(([shiftId]) => nextShiftIds.includes(Number(shiftId))),
                        ),
                        shiftColorOverrides: Object.fromEntries(
                          Object.entries(
                            normalizeShiftColorOverrides(prev.shiftColorOverrides),
                          ).filter(([shiftId]) => nextShiftIds.includes(Number(shiftId))),
                        ),
                      };
                    })
                  }
                  onToggleAll={() =>
                    setForm((prev) => {
                      const nextFocusAreaIds =
                        prev.focusAreaIds.length === availableFocusAreaIds.length
                          ? []
                          : availableFocusAreaIds;
                      const validShiftIds = activeShifts
                        .filter(
                          (shift) =>
                            shift.focusAreaId != null &&
                            nextFocusAreaIds.includes(shift.focusAreaId),
                        )
                        .map((shift) => shift.id);
                      return {
                        ...prev,
                        focusAreaIds: nextFocusAreaIds,
                        applicableShiftIds: prev.applicableShiftIds.filter((shiftId) =>
                          validShiftIds.includes(shiftId),
                        ),
                        shiftTimeOverrides: Object.fromEntries(
                          Object.entries(
                            normalizeShiftTimeOverrides(prev.shiftTimeOverrides),
                          ).filter(([shiftId]) => validShiftIds.includes(Number(shiftId))),
                        ),
                        shiftColorOverrides: Object.fromEntries(
                          Object.entries(
                            normalizeShiftColorOverrides(prev.shiftColorOverrides),
                          ).filter(([shiftId]) => validShiftIds.includes(Number(shiftId))),
                        ),
                      };
                    })
                  }
                  disabled={
                    !canManageScheduleDefinitions ||
                    isRegularStaffJob ||
                    form.departmentIds.length === 0
                  }
                  emptyMessage={
                    form.departmentIds.length === 0
                      ? "Select scheduled departments first."
                      : "No focus areas exist in the selected departments yet."
                  }
                />

                <ChecklistPanel
                  title="Shifts"
                  summary={
                    form.focusAreaIds.length === 0
                      ? "Select focus areas first."
                      : form.applicableShiftIds.length === 0
                        ? "Choose the shifts where this job applies."
                        : `${formatCount(form.applicableShiftIds.length, "shift")} selected`
                  }
                  items={availableShifts.map((shift) => ({
                    id: shift.id,
                    label: shiftLabelById.get(shift.id) ?? shift.name,
                    description:
                      shift.startTime && shift.endTime
                        ? `${shift.startTime.slice(0, 5)}-${shift.endTime.slice(0, 5)}`
                        : undefined,
                  }))}
                  selectedIds={form.applicableShiftIds}
                  onToggle={(shiftId) =>
                    setForm((prev) => {
                      const nextApplicableShiftIds = prev.applicableShiftIds.includes(shiftId)
                        ? prev.applicableShiftIds.filter((value) => value !== shiftId)
                        : [...prev.applicableShiftIds, shiftId];
                      return {
                        ...prev,
                        applicableShiftIds: nextApplicableShiftIds,
                        shiftTimeOverrides: Object.fromEntries(
                          Object.entries(
                            normalizeShiftTimeOverrides(prev.shiftTimeOverrides),
                          ).filter(([overrideShiftId]) =>
                            nextApplicableShiftIds.includes(Number(overrideShiftId)),
                          ),
                        ),
                        shiftColorOverrides: Object.fromEntries(
                          Object.entries(
                            normalizeShiftColorOverrides(prev.shiftColorOverrides),
                          ).filter(([overrideShiftId]) =>
                            nextApplicableShiftIds.includes(Number(overrideShiftId)),
                          ),
                        ),
                      };
                    })
                  }
                  onToggleAll={() =>
                    setForm((prev) => {
                      const nextApplicableShiftIds =
                        prev.applicableShiftIds.length === availableShifts.length
                          ? []
                          : availableShifts.map((shift) => shift.id);
                      return {
                        ...prev,
                        applicableShiftIds: nextApplicableShiftIds,
                        shiftTimeOverrides: Object.fromEntries(
                          Object.entries(
                            normalizeShiftTimeOverrides(prev.shiftTimeOverrides),
                          ).filter(([overrideShiftId]) =>
                            nextApplicableShiftIds.includes(Number(overrideShiftId)),
                          ),
                        ),
                        shiftColorOverrides: Object.fromEntries(
                          Object.entries(
                            normalizeShiftColorOverrides(prev.shiftColorOverrides),
                          ).filter(([overrideShiftId]) =>
                            nextApplicableShiftIds.includes(Number(overrideShiftId)),
                          ),
                        ),
                      };
                    })
                  }
                  disabled={
                    !canManageScheduleDefinitions ||
                    isRegularStaffJob ||
                    form.focusAreaIds.length === 0
                  }
                  emptyMessage={
                    form.focusAreaIds.length === 0
                      ? "Select focus areas first."
                      : "No shifts exist in the selected focus areas yet."
                  }
                />
              </div>
            </SectionBlock>
          ) : null}

          {isScheduledLikeSection(section) ? (
            <SectionBlock
              title="Per-shift Settings"
              description="Scheduled jobs inherit each selected shift by default. Customize the color and time only where this job needs to behave differently."
              summary={perShiftSettingsSummary}
              collapsible
              defaultOpen={overrideCount > 0}
            >
              {selectedShifts.length === 0 ? (
                <div
                  style={{
                    padding: "12px 14px",
                    borderRadius: "var(--dg-radius-sm)",
                    border: "1px solid var(--dg-color-border-light)",
                    background: "var(--dg-color-bg-secondary)",
                    color: "var(--dg-color-text-muted)",
                    fontSize: "var(--dg-fs-label)",
                  }}
                >
                  Select at least one shift above to configure this job.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {selectedShifts.map((shift) => {
                    const shiftLabel = shiftLabelById.get(shift.id) ?? shift.name;
                    const colorOverride = getJobShiftColorOverride(form, shift.id);
                    const resolvedColor = colorOverride ?? shift.color ?? DEFAULT_JOB_PRESET_COLOR;
                    const timeOverride = getJobShiftTimeOverride(form, shift.id);
                    const previewPrimary = getShiftPreviewPrimaryLabel({
                      shiftName: shift.name,
                      shiftAbbr: shift.abbr,
                      shiftDisplayMode: "name",
                    });
                    const previewSecondary = isDefaultShiftJob
                      ? null
                      : getJobPreviewLabel({
                          jobName: form.name,
                          jobAbbr: form.abbr,
                          shiftDisplayMode: "name",
                        });
                    const resolvedTimes = resolveJobTimesForShift(
                      {
                        assignmentMode: "with_shift",
                        defaultStartTime: null,
                        defaultEndTime: null,
                        shiftTimeOverrides: form.shiftTimeOverrides,
                      },
                      shift,
                    );

                    return (
                      <div
                        key={shift.id}
                        style={{
                          padding: "12px 14px",
                          borderRadius: "var(--dg-radius-md)",
                          border: "1px solid var(--dg-color-border-light)",
                          background: "var(--dg-color-surface)",
                          display: "flex",
                          flexDirection: "column",
                          gap: 10,
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: 12,
                            flexWrap: "wrap",
                          }}
                        >
                          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                            <div
                              style={{
                                fontSize: "var(--dg-fs-label)",
                                fontWeight: 700,
                                color: "var(--dg-color-text-primary)",
                              }}
                            >
                              {shiftLabel}
                            </div>
                            <div
                              style={{
                                fontSize: "var(--dg-fs-caption)",
                                color: "var(--dg-color-text-muted)",
                              }}
                            >
                              {shift.startTime && shift.endTime
                                ? `Inherits ${shift.startTime.slice(0, 5)}-${shift.endTime.slice(0, 5)} when time override is off`
                                : "No shift time configured yet"}
                            </div>
                          </div>

                          <ShiftPreviewPill
                            primary={previewPrimary}
                            secondary={previewSecondary}
                            bg={resolvedColor}
                            mode="name"
                            previewId={String(shift.id)}
                          />
                        </div>

                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: isMobile ? "1fr" : "minmax(0, 1fr) minmax(0, 1fr)",
                            gap: 12,
                          }}
                        >
                          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                            <label style={labelStyle}>Color override</label>
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 10,
                                flexWrap: "wrap",
                              }}
                            >
                              <PresetColorPicker
                                valueBg={resolvedColor}
                                onChange={(color) =>
                                  setForm((prev) => ({
                                    ...prev,
                                    shiftColorOverrides: {
                                      ...normalizeShiftColorOverrides(prev.shiftColorOverrides),
                                      [String(shift.id)]: color.bg,
                                    },
                                  }))
                                }
                                disabled={!canManageScheduleDefinitions || isRegularStaffJob}
                              />
                              <Button
                                type="button"
                                className="dg-btn dg-btn-secondary dg-btn-sm"
                                onClick={() =>
                                  setForm((prev) => {
                                    const nextOverrides = {
                                      ...normalizeShiftColorOverrides(prev.shiftColorOverrides),
                                    };
                                    delete nextOverrides[String(shift.id)];
                                    return { ...prev, shiftColorOverrides: nextOverrides };
                                  })
                                }
                                disabled={
                                  !canManageScheduleDefinitions ||
                                  isRegularStaffJob ||
                                  colorOverride == null
                                }
                              >
                                {colorOverride == null ? "Using shift color" : "Use shift color"}
                              </Button>
                            </div>
                          </div>

                          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                            <label style={labelStyle}>Time</label>
                            <label
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 10,
                                fontSize: "var(--dg-fs-label)",
                                color: "var(--dg-color-text-secondary)",
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={timeOverride != null}
                                onChange={(event) =>
                                  setForm((prev) => {
                                    const nextOverrides = {
                                      ...normalizeShiftTimeOverrides(prev.shiftTimeOverrides),
                                    };
                                    if (!event.target.checked) {
                                      delete nextOverrides[String(shift.id)];
                                      return { ...prev, shiftTimeOverrides: nextOverrides };
                                    }
                                    nextOverrides[String(shift.id)] = {
                                      startTime: shift.startTime ?? null,
                                      endTime: shift.endTime ?? null,
                                    };
                                    return { ...prev, shiftTimeOverrides: nextOverrides };
                                  })
                                }
                                disabled={!canManageScheduleDefinitions || isRegularStaffJob}
                              />
                              Override time
                            </label>

                            {timeOverride ? (
                              <div
                                style={{
                                  display: "flex",
                                  gap: 14,
                                  alignItems: "end",
                                  flexWrap: "wrap",
                                }}
                              >
                                <div>
                                  <label style={labelStyle}>Start</label>
                                  <TimeInput12h
                                    value={timeOverride.startTime}
                                    onChange={(value) =>
                                      setForm((prev) => ({
                                        ...prev,
                                        shiftTimeOverrides: {
                                          ...normalizeShiftTimeOverrides(prev.shiftTimeOverrides),
                                          [String(shift.id)]: {
                                            startTime: value,
                                            endTime:
                                              normalizeShiftTimeOverrides(prev.shiftTimeOverrides)[
                                                String(shift.id)
                                              ]?.endTime ?? null,
                                          },
                                        },
                                      }))
                                    }
                                    disabled={!canManageScheduleDefinitions || isRegularStaffJob}
                                  />
                                </div>
                                <div>
                                  <label style={labelStyle}>End</label>
                                  <TimeInput12h
                                    value={timeOverride.endTime}
                                    onChange={(value) =>
                                      setForm((prev) => ({
                                        ...prev,
                                        shiftTimeOverrides: {
                                          ...normalizeShiftTimeOverrides(prev.shiftTimeOverrides),
                                          [String(shift.id)]: {
                                            startTime:
                                              normalizeShiftTimeOverrides(prev.shiftTimeOverrides)[
                                                String(shift.id)
                                              ]?.startTime ?? null,
                                            endTime: value,
                                          },
                                        },
                                      }))
                                    }
                                    disabled={!canManageScheduleDefinitions || isRegularStaffJob}
                                  />
                                </div>
                              </div>
                            ) : (
                              <div
                                style={{
                                  fontSize: "var(--dg-fs-caption)",
                                  color: "var(--dg-color-text-muted)",
                                }}
                              >
                                Using {resolvedTimes.startTime?.slice(0, 5) ?? "—"}-
                                {resolvedTimes.endTime?.slice(0, 5) ?? "—"} from the shift.
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </SectionBlock>
          ) : null}

          <SectionBlock
            title="Eligibility"
            description={`Pick any schedule-eligible ${roleLabel.toLowerCase()} and ${certificationLabel.toLowerCase()} that can qualify staff. Selections inside each list are alternatives. Leave either list empty to keep that gate open.`}
            summary={`${eligibleRoleSummary} · ${certificationSummary}`}
            collapsible
            defaultOpen={false}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: isMobile ? "1fr" : "minmax(0, 1fr) 220px minmax(0, 1fr)",
                gap: 12,
                alignItems: "start",
              }}
            >
              <ChecklistPanel
                title={`Eligible ${roleLabel.toLowerCase()}`}
                summary={eligibleRoleSummary}
                items={scheduleRoles.map((role) => ({
                  id: role.id,
                  label: role.name,
                }))}
                selectedIds={form.eligibleRoleIds}
                onToggle={(roleId) =>
                  setForm((prev) => ({
                    ...prev,
                    eligibleRoleIds: prev.eligibleRoleIds.includes(roleId)
                      ? prev.eligibleRoleIds.filter((value) => value !== roleId)
                      : [...prev.eligibleRoleIds, roleId],
                  }))
                }
                onToggleAll={() =>
                  setForm((prev) => ({
                    ...prev,
                    eligibleRoleIds:
                      prev.eligibleRoleIds.length === scheduleRoles.length
                        ? []
                        : scheduleRoles.map((role) => role.id),
                  }))
                }
                disabled={!canManageScheduleDefinitions}
                emptyMessage={`No schedule-eligible ${roleLabel.toLowerCase()} are configured yet.`}
              />

              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                  alignSelf: isMobile ? "stretch" : "center",
                }}
              >
                <EligibilityModeToggle
                  value={form.eligibilityMode}
                  onChange={(value) => setForm((prev) => ({ ...prev, eligibilityMode: value }))}
                  disabled={!canManageScheduleDefinitions}
                  dimmed={eligibilityModeDimmed}
                />
                <div
                  style={{
                    fontSize: "var(--dg-fs-caption)",
                    color: "var(--dg-color-text-muted)",
                    lineHeight: 1.45,
                    minHeight: "calc(var(--dg-fs-caption) * 1.45 * 2)",
                  }}
                >
                  {eligibilityModeDimmed
                    ? "Activates once both lists have selections."
                    : form.eligibilityMode === "and"
                      ? "Staff need a match in both lists."
                      : "Staff need a match in at least one list."}
                </div>
              </div>

              <ChecklistPanel
                title={`Required ${certificationLabel.toLowerCase()}`}
                summary={certificationSummary}
                items={certifications.map((certification) => ({
                  id: certification.id,
                  label: certification.name,
                }))}
                selectedIds={form.requiredCertificationIds}
                onToggle={(certificationId) =>
                  setForm((prev) => ({
                    ...prev,
                    requiredCertificationIds: prev.requiredCertificationIds.includes(
                      certificationId,
                    )
                      ? prev.requiredCertificationIds.filter((value) => value !== certificationId)
                      : [...prev.requiredCertificationIds, certificationId],
                  }))
                }
                onToggleAll={() =>
                  setForm((prev) => ({
                    ...prev,
                    requiredCertificationIds:
                      prev.requiredCertificationIds.length === certifications.length
                        ? []
                        : certifications.map((certification) => certification.id),
                  }))
                }
                disabled={!canManageScheduleDefinitions}
                emptyMessage={`No ${certificationLabel.toLowerCase()} are configured yet.`}
              />
            </div>
          </SectionBlock>

          {duplicateName || duplicateAbbr ? (
            <p
              style={{
                color: "var(--dg-color-danger)",
                fontSize: "var(--dg-fs-caption)",
                margin: 0,
              }}
            >
              {duplicateName
                ? "Another job already uses that name."
                : "Another job already uses that abbreviation."}
            </p>
          ) : null}

          {isScheduledLikeSection(section) && form.departmentIds.length === 0 ? (
            <p
              style={{
                color: "var(--dg-color-danger)",
                fontSize: "var(--dg-fs-caption)",
                margin: 0,
              }}
            >
              Select at least one scheduled department.
            </p>
          ) : null}

          {isScheduledLikeSection(section) &&
          form.departmentIds.length > 0 &&
          form.focusAreaIds.length === 0 ? (
            <p
              style={{
                color: "var(--dg-color-danger)",
                fontSize: "var(--dg-fs-caption)",
                margin: 0,
              }}
            >
              Select at least one focus area.
            </p>
          ) : null}

          {isScheduledLikeSection(section) &&
          form.focusAreaIds.length > 0 &&
          form.applicableShiftIds.length === 0 ? (
            <p
              style={{
                color: "var(--dg-color-danger)",
                fontSize: "var(--dg-fs-caption)",
                margin: 0,
              }}
            >
              Select at least one shift.
            </p>
          ) : null}

          {incompleteShiftOverride ? (
            <p
              style={{
                color: "var(--dg-color-danger)",
                fontSize: "var(--dg-fs-caption)",
                margin: 0,
              }}
            >
              Enter both a start and end time for each enabled time override.
            </p>
          ) : null}

          {incompleteGeneralJobTime ? (
            <p
              style={{
                color: "var(--dg-color-danger)",
                fontSize: "var(--dg-fs-caption)",
                margin: 0,
              }}
            >
              Enter both a start and end time, or switch this general job to duration mode.
            </p>
          ) : null}

          <EditorActionRow
            destructiveAction={
              canManageScheduleDefinitions && !job.isNew && !isLockedIdentityJob ? (
                <Button
                  onClick={handleDeleteClick}
                  loading={deleting}
                  className="dg-btn dg-btn-danger dg-btn-sm"
                >
                  Archive
                </Button>
              ) : undefined
            }
            secondaryAction={
              <Button
                onClick={() => (job.isNew || !isDirty ? closeEditor() : discardDraft(false))}
                className="dg-btn dg-btn-secondary dg-btn-sm"
              >
                {getEditorDismissLabel({ hasUnsavedChanges: isDirty, isCreating: job.isNew })}
              </Button>
            }
            primaryAction={
              <Button
                onClick={handleSave}
                disabled={saving || !canSave || !canManageScheduleDefinitions}
                className="dg-btn dg-btn-primary dg-btn-sm"
              >
                <ButtonLoading loading={saving}>{EDITOR_ACTION_LABELS.save}</ButtonLoading>
              </Button>
            }
          />
        </div>
      ) : null}

      {unsavedChangesDialog}
      {showDeleteConfirm
        ? (() => {
            const hasActive = dependencyInfo?.hasDependencies ?? false;
            const hasAny = dependencyInfo?.hasAnyReferences ?? true;
            if (hasActive) {
              return (
                <ConfirmDialog
                  title={`Archive "${form.name}"?`}
                  message={
                    <>
                      <strong>{form.name}</strong> is currently{" "}
                      {dependencyInfo!.summary.toLowerCase()}.
                      <br />
                      <br />
                      Archiving will preserve history but remove the job from future scheduling and
                      coverage configuration.
                    </>
                  }
                  confirmLabel="Archive"
                  variant="warning"
                  isLoading={deleting}
                  onConfirm={() => handleDelete(false)}
                  onCancel={() => setShowDeleteConfirm(false)}
                />
              );
            }
            if (hasAny) {
              return (
                <ConfirmDialog
                  title={`Archive "${form.name}"?`}
                  message={
                    <>
                      This will archive <strong>{form.name}</strong>. Historical records will stay
                      intact.
                    </>
                  }
                  confirmLabel="Archive"
                  variant="warning"
                  isLoading={deleting}
                  onConfirm={() => handleDelete(false)}
                  onCancel={() => setShowDeleteConfirm(false)}
                />
              );
            }
            return (
              <ConfirmDialog
                title={`Delete "${form.name}"?`}
                message={
                  <>
                    This will permanently delete <strong>{form.name}</strong>. Nothing references
                    it.
                  </>
                }
                confirmLabel="Delete"
                variant="danger"
                isLoading={deleting}
                onConfirm={() => handleDelete(true)}
                onCancel={() => setShowDeleteConfirm(false)}
              />
            );
          })()
        : null}
    </div>
  );
}

export default function JobsSettings({
  jobs,
  orgId,
  orgRoles,
  certifications,
  departments = [],
  focusAreas = [],
  shiftCategories = [],
  roleLabel,
  certificationLabel,
  onChange,
  canManageScheduleDefinitions,
  organization,
  onOrganizationSave,
}: {
  jobs: JobDefinition[];
  orgId: string;
  orgRoles: NamedItem[];
  certifications: NamedItem[];
  departments?: Department[];
  focusAreas?: FocusArea[];
  shiftCategories?: ShiftCategory[];
  roleLabel: string;
  certificationLabel: string;
  onChange: (jobs: JobDefinition[]) => void;
  canManageScheduleDefinitions: boolean;
  organization?: Organization;
  onOrganizationSave?: (o: Organization) => void;
}) {
  const [local, setLocal] = useState<Array<JobDefinition & { isNew?: boolean }>>(jobs);
  const nextTmpId = useRef(-1);
  const defaultShiftEnabled = organization?.defaultShiftEnabled ?? true;

  useEffect(() => {
    setLocal((previous) => {
      const unsaved = previous.filter((job) => job.isNew);
      return [...jobs, ...unsaved];
    });
  }, [jobs]);

  const scheduleRoles = useMemo(
    () => orgRoles.filter((role) => role.isScheduleRole !== false),
    [orgRoles],
  );
  const activeShiftCategories = useMemo(
    () => sortByOrder(shiftCategories.filter((shift) => !shift.archivedAt)),
    [shiftCategories],
  );
  const activeScheduledDepartments = useMemo(
    () =>
      sortByOrder(
        departments.filter(
          (department) => !department.archivedAt && department.type === "scheduled",
        ),
      ),
    [departments],
  );
  const visibleRows = useMemo(
    () => local.filter((job) => !isRegularStaffSystemJob(job) && !isDefaultShiftSystemJob(job)),
    [local],
  );
  const defaultShiftRows = useMemo(() => {
    const existing = local.find((job) => isDefaultShiftSystemJob(job));
    if (existing) return [existing];

    const defaultDepartmentId =
      activeScheduledDepartments.find((department) =>
        focusAreas.some(
          (focusArea) =>
            focusArea.departmentId === department.id &&
            activeShiftCategories.some((shift) => shift.focusAreaId === focusArea.id),
        ),
      )?.id ?? null;
    const focusAreaIds =
      defaultDepartmentId == null
        ? []
        : focusAreas
            .filter((focusArea) => focusArea.departmentId === defaultDepartmentId)
            .map((focusArea) => focusArea.id);

    return [
      {
        id: -999_001,
        orgId,
        name: DEFAULT_SHIFT_JOB_NAME,
        abbr: DEFAULT_SHIFT_JOB_ABBR,
        showOnGrid: false,
        assignmentMode: "with_shift" as const,
        eligibilityMode: "and" as const,
        focusAreaId: null,
        focusAreaIds,
        departmentIds: defaultDepartmentId != null ? [defaultDepartmentId] : [],
        applicableShiftIds:
          defaultDepartmentId == null
            ? []
            : activeShiftCategories
                .filter(
                  (shift) =>
                    shift.focusAreaId != null &&
                    focusAreas.some(
                      (focusArea) =>
                        focusArea.id === shift.focusAreaId &&
                        focusArea.departmentId === defaultDepartmentId,
                    ),
                )
                .map((shift) => shift.id),
        eligibleRoleIds: [],
        requiredCertificationIds: [],
        color: EMPTY_SCHEDULED_JOB_STYLE.color,
        border: EMPTY_SCHEDULED_JOB_STYLE.border,
        text: EMPTY_SCHEDULED_JOB_STYLE.text,
        shiftTimeOverrides: {},
        shiftColorOverrides: {},
        defaultStartTime: null,
        defaultEndTime: null,
        defaultDurationHours: null,
        defaultDurationMinutes: null,
        sortOrder: -1000,
        systemKey: DEFAULT_SHIFT_JOB_SYSTEM_KEY,
        archivedAt: null,
        isNew: true as const,
      },
    ];
  }, [activeScheduledDepartments, activeShiftCategories, focusAreas, orgId]);
  const scheduledRows = useMemo(() => {
    const scheduled = visibleRows.filter((job) => getJobSection(job) === "scheduled");
    const persisted = scheduled
      .filter((job) => !job.isNew)
      .sort((left, right) =>
        compareJobsByQualificationSeniority(left, right, orgRoles, certifications),
      );
    const drafts = scheduled.filter((job) => job.isNew);
    return [...(defaultShiftEnabled ? defaultShiftRows : []), ...persisted, ...drafts];
  }, [certifications, defaultShiftEnabled, defaultShiftRows, orgRoles, visibleRows]);
  const shiftlessRows = useMemo(() => {
    const shiftless = visibleRows.filter((job) => getJobSection(job) === "shiftless");
    const persisted = shiftless
      .filter((job) => !job.isNew)
      .sort((left, right) =>
        compareJobsByQualificationSeniority(left, right, orgRoles, certifications),
      );
    const drafts = shiftless.filter((job) => job.isNew);
    return [...persisted, ...drafts];
  }, [certifications, orgRoles, visibleRows]);
  const canCreateScheduledJob =
    activeScheduledDepartments.length > 0 &&
    activeShiftCategories.some((shift) => shift.focusAreaId != null);

  const emitPersistedJobs = useCallback(
    (nextJobs: Array<JobDefinition & { isNew?: boolean }>) => {
      onChange(nextJobs.filter((job) => !job.isNew));
    },
    [onChange],
  );

  const handleAddScheduledJob = useCallback(() => {
    const defaultDepartmentId =
      activeScheduledDepartments.find((department) =>
        focusAreas.some(
          (focusArea) =>
            focusArea.departmentId === department.id &&
            activeShiftCategories.some((shift) => shift.focusAreaId === focusArea.id),
        ),
      )?.id ?? null;
    const nextJob: JobDefinition & { isNew: true } = {
      id: nextTmpId.current--,
      orgId,
      name: "",
      abbr: "",
      showOnGrid: true,
      assignmentMode: "with_shift",
      eligibilityMode: "and",
      focusAreaId: null,
      focusAreaIds:
        defaultDepartmentId == null
          ? []
          : focusAreas
              .filter((focusArea) => focusArea.departmentId === defaultDepartmentId)
              .map((focusArea) => focusArea.id),
      departmentIds: defaultDepartmentId != null ? [defaultDepartmentId] : [],
      applicableShiftIds:
        defaultDepartmentId == null
          ? []
          : activeShiftCategories
              .filter(
                (shift) =>
                  shift.focusAreaId != null &&
                  focusAreas.some(
                    (focusArea) =>
                      focusArea.id === shift.focusAreaId &&
                      focusArea.departmentId === defaultDepartmentId,
                  ),
              )
              .map((shift) => shift.id),
      eligibleRoleIds: [],
      requiredCertificationIds: [],
      color: EMPTY_SCHEDULED_JOB_STYLE.color,
      border: EMPTY_SCHEDULED_JOB_STYLE.border,
      text: EMPTY_SCHEDULED_JOB_STYLE.text,
      shiftTimeOverrides: {},
      shiftColorOverrides: {},
      defaultStartTime: null,
      defaultEndTime: null,
      defaultDurationHours: null,
      defaultDurationMinutes: null,
      sortOrder: local.length,
      systemKey: null,
      archivedAt: null,
      isNew: true,
    };
    setLocal((previous) => [...previous, nextJob]);
  }, [activeScheduledDepartments, activeShiftCategories, focusAreas, local.length, orgId]);

  const handleAddShiftlessJob = useCallback(() => {
    const defaultPreset = PREDEFINED_COLORS[0]!;
    const nextJob: JobDefinition & { isNew: true } = {
      id: nextTmpId.current--,
      orgId,
      name: "",
      abbr: "",
      showOnGrid: true,
      assignmentMode: "shiftless",
      eligibilityMode: "and",
      focusAreaId: null,
      focusAreaIds: [],
      departmentIds: [],
      applicableShiftIds: [],
      eligibleRoleIds: [],
      requiredCertificationIds: [],
      color: defaultPreset.bg,
      border: TRANSPARENT_BORDER,
      text: defaultPreset.text,
      shiftTimeOverrides: {},
      shiftColorOverrides: {},
      defaultStartTime: null,
      defaultEndTime: null,
      defaultDurationHours: null,
      defaultDurationMinutes: null,
      sortOrder: local.length,
      systemKey: null,
      archivedAt: null,
      isNew: true,
    };
    setLocal((previous) => [...previous, nextJob]);
  }, [local.length, orgId]);

  const handleSaved = useCallback(
    (saved: JobDefinition, previousId: number) => {
      const replaced = local.some((job) => job.id === previousId);
      const updated = replaced
        ? local.map((job) => (job.id === previousId ? saved : job))
        : [...local, saved];
      setLocal(updated);
      emitPersistedJobs(updated);
    },
    [emitPersistedJobs, local],
  );

  const handleDeleted = useCallback(
    (id: number) => {
      const updated = local.filter((job) => job.id !== id);
      setLocal(updated);
      emitPersistedJobs(updated);
    },
    [emitPersistedJobs, local],
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {scheduleRoles.length === 0 ? (
        <div
          style={{
            padding: "12px 14px",
            borderRadius: "var(--dg-radius-md)",
            border: "1px solid var(--dg-color-border-light)",
            background: "var(--dg-color-bg-secondary)",
            color: "var(--dg-color-text-secondary)",
            fontSize: "var(--dg-fs-label)",
            lineHeight: 1.5,
          }}
        >
          No schedule-eligible roles are configured yet. Jobs can still be limited by{" "}
          {certificationLabel.toLowerCase()}, but role gating stays open until you mark roles as
          schedule-eligible.
        </div>
      ) : null}

      <JobSectionCard
        section="scheduled"
        rows={scheduledRows}
        canManageScheduleDefinitions={canManageScheduleDefinitions && canCreateScheduledJob}
        onAdd={handleAddScheduledJob}
        headerAction={
          organization && onOrganizationSave ? (
            <DefaultShiftToggle
              organization={organization}
              onOrganizationSave={onOrganizationSave}
              disabled={!canManageScheduleDefinitions}
            />
          ) : undefined
        }
      >
        {scheduledRows.map((job, jobIndex) => (
          <JobRow
            key={job.id}
            job={job}
            section={isDefaultShiftSystemJob(job) ? "defaultShift" : "scheduled"}
            orgId={orgId}
            roleLabel={roleLabel}
            certificationLabel={certificationLabel}
            scheduleRoles={scheduleRoles}
            certifications={certifications}
            departments={departments}
            focusAreas={focusAreas}
            shiftCategories={activeShiftCategories}
            onSaved={handleSaved}
            onDeleted={handleDeleted}
            canManageScheduleDefinitions={canManageScheduleDefinitions}
            allJobs={visibleRows}
            shiftDisplayMode={organization?.shiftDisplayMode ?? "code"}
            isLast={jobIndex === scheduledRows.length - 1}
          />
        ))}
      </JobSectionCard>

      {!canCreateScheduledJob ? (
        <div
          style={{
            marginTop: -4,
            fontSize: "var(--dg-fs-caption)",
            color: "var(--dg-color-text-muted)",
            lineHeight: 1.45,
          }}
        >
          Create at least one scheduled department with a focus area and shift before adding
          scheduled jobs.
        </div>
      ) : null}

      <JobSectionCard
        section="shiftless"
        rows={shiftlessRows}
        canManageScheduleDefinitions={canManageScheduleDefinitions}
        onAdd={handleAddShiftlessJob}
      >
        {shiftlessRows.map((job, jobIndex) => (
          <JobRow
            key={job.id}
            job={job}
            section="shiftless"
            orgId={orgId}
            roleLabel={roleLabel}
            certificationLabel={certificationLabel}
            scheduleRoles={scheduleRoles}
            certifications={certifications}
            departments={departments}
            focusAreas={focusAreas}
            shiftCategories={activeShiftCategories}
            onSaved={handleSaved}
            onDeleted={handleDeleted}
            canManageScheduleDefinitions={canManageScheduleDefinitions}
            allJobs={visibleRows}
            shiftDisplayMode={organization?.shiftDisplayMode ?? "code"}
            isLast={jobIndex === shiftlessRows.length - 1}
          />
        ))}
      </JobSectionCard>
    </div>
  );
}
