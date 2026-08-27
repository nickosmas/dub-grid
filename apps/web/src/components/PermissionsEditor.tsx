"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import Modal from "@/components/Modal";
import { Button } from "@/components/Button";
import { EDITOR_ACTION_LABELS } from "@/components/ui/editor-action-labels";
import { EditorActionRow } from "@/components/ui/editor-action-row";
import { useUnsavedChangesPrompt } from "@/components/ui/use-unsaved-changes-prompt";
import ChangeReviewModal, { type ReviewChange } from "@/components/review/ChangeReviewModal";
import type { AdminPermissions } from "@/types";
import { ButtonLoading } from "@/components/ButtonSpinner";
import { formatClientErrorMessage } from "@/lib/client-facing";

// ── View / Edit implication pairs ───────────────────────────────────────────
export const VIEW_EDIT_PAIRS: { view: keyof AdminPermissions; edit: keyof AdminPermissions }[] = [
  { view: "canViewEmployeeDetails", edit: "canManageEmployees" },
  { view: "canViewRecurringShifts", edit: "canManageRecurringShifts" },
  { view: "canViewFocusAreas", edit: "canManageFocusAreas" },
  { view: "canViewScheduleDefinitions", edit: "canManageScheduleDefinitions" },
  { view: "canViewIndicatorTypes", edit: "canManageIndicatorTypes" },
  { view: "canViewOrgLabels", edit: "canManageOrgLabels" },
  { view: "canViewCoverageRequirements", edit: "canManageCoverageRequirements" },
];

// ── Module config ────────────────────────────────────────────────────────────

type Category = "CORE" | "ADMINISTRATION";

export interface PermissionModule {
  id: string;
  title: string;
  description: string;
  icon: keyof typeof MODULE_ICONS;
  category: Category;
  viewKeys: (keyof AdminPermissions)[];
  editKeys: (keyof AdminPermissions)[];
  alwaysOnView?: boolean;
}

export interface PermissionReviewConfig {
  title: string;
  description: string;
  changes: ReviewChange[];
  confirmLabel?: string;
  warningText?: string;
}

const CATEGORY_LABELS: Record<Category, string> = {
  CORE: "Core Operations",
  ADMINISTRATION: "Administration",
};

const CATEGORY_ORDER: Category[] = ["CORE", "ADMINISTRATION"];

export const PERMISSION_MODULES: PermissionModule[] = [
  {
    id: "schedule",
    title: "Schedule",
    description: "View and edit the organization-wide shift schedule.",
    icon: "calendar",
    category: "CORE",
    viewKeys: [],
    editKeys: ["canEditShifts", "canPublishSchedule", "canEditNotes", "canEditScheduleIndicators"],
    alwaysOnView: true,
  },
  {
    id: "recurring-shifts",
    title: "Recurring Shifts",
    description: "Manage recurring shift templates, series, and apply to date ranges.",
    icon: "repeat",
    category: "CORE",
    viewKeys: ["canViewRecurringShifts"],
    editKeys: ["canManageRecurringShifts", "canApplyRecurringSchedule", "canManageShiftSeries"],
  },
  {
    id: "staff",
    title: "Staff",
    description: "Access employee profiles, contact info, and certifications.",
    icon: "users",
    category: "CORE",
    viewKeys: ["canViewEmployeeDetails"],
    editKeys: ["canManageEmployees"],
  },
  {
    id: "shift-requests",
    title: "Shift Requests",
    description: "Approve or deny shift pickup and swap requests.",
    icon: "checkCircle",
    category: "CORE",
    viewKeys: [],
    editKeys: ["canApproveShiftRequests"],
  },
  {
    id: "coverage",
    title: "Coverage",
    description: "Set staffing minimums and coverage targets.",
    icon: "barChart",
    category: "ADMINISTRATION",
    viewKeys: ["canViewCoverageRequirements"],
    editKeys: ["canManageCoverageRequirements"],
  },
  {
    id: "configuration",
    title: "Configuration",
    description: "Manage departments, shifts, jobs, indicators, and labels.",
    icon: "settings",
    category: "ADMINISTRATION",
    viewKeys: [
      "canViewFocusAreas",
      "canViewScheduleDefinitions",
      "canViewIndicatorTypes",
      "canViewOrgLabels",
    ],
    editKeys: [
      "canManageFocusAreas",
      "canManageScheduleDefinitions",
      "canManageIndicatorTypes",
      "canManageOrgLabels",
    ],
  },
  {
    id: "org-settings",
    title: "Organization Settings",
    description: "Edit organization name, address, and timezone.",
    icon: "building",
    category: "ADMINISTRATION",
    viewKeys: [],
    editKeys: ["canManageOrgSettings"],
  },
  {
    id: "dashboard",
    title: "Dashboard",
    description: "View analytics and statistics.",
    icon: "pieChart",
    category: "ADMINISTRATION",
    viewKeys: ["canViewDashboardAnalytics"],
    editKeys: [],
  },
];

const ALWAYS_ON_KEYS = new Set<keyof AdminPermissions>(["canViewSchedule", "canViewStaff"]);

const DEFAULT_PERMISSIONS: AdminPermissions = {
  canViewSchedule: true,
  canEditShifts: false,
  canPublishSchedule: false,
  canApplyRecurringSchedule: false,
  canEditNotes: false,
  canEditScheduleIndicators: false,
  canViewRecurringShifts: false,
  canManageRecurringShifts: false,
  canManageShiftSeries: false,
  canViewStaff: true,
  canViewEmployeeDetails: false,
  canManageEmployees: false,
  canViewFocusAreas: false,
  canManageFocusAreas: false,
  canViewScheduleDefinitions: false,
  canManageScheduleDefinitions: false,
  canViewIndicatorTypes: false,
  canManageIndicatorTypes: false,
  canManageOrgSettings: false,
  canViewOrgLabels: false,
  canManageOrgLabels: false,
  canViewCoverageRequirements: false,
  canManageCoverageRequirements: false,
  canApproveShiftRequests: false,
  canViewDashboardAnalytics: false,
};

const EMPTY_LOCKED_FALSE: (keyof AdminPermissions)[] = [];

function buildInitialPermissions(
  initialPermissions: AdminPermissions | null | undefined,
  lockedFalse: (keyof AdminPermissions)[],
): AdminPermissions {
  const initial: AdminPermissions = {
    ...DEFAULT_PERMISSIONS,
    ...(initialPermissions ?? {}),
    canViewSchedule: true,
    canViewStaff: true,
  };

  for (const key of lockedFalse) {
    (initial as unknown as Record<string, boolean>)[key] = false;
  }

  return initial;
}

// ── Icons ────────────────────────────────────────────────────────────────────

const iconProps = {
  width: 20,
  height: 20,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export const MODULE_ICONS = {
  calendar: () => (
    <svg {...iconProps}>
      <rect width="18" height="18" x="3" y="4" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  ),
  repeat: () => (
    <svg {...iconProps}>
      <polyline points="17 1 21 5 17 9" />
      <path d="M3 11V9a4 4 0 0 1 4-4h14" />
      <polyline points="7 23 3 19 7 15" />
      <path d="M21 13v2a4 4 0 0 1-4 4H3" />
    </svg>
  ),
  users: () => (
    <svg {...iconProps}>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
  checkCircle: () => (
    <svg {...iconProps}>
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  ),
  barChart: () => (
    <svg {...iconProps}>
      <line x1="12" y1="20" x2="12" y2="10" />
      <line x1="18" y1="20" x2="18" y2="4" />
      <line x1="6" y1="20" x2="6" y2="16" />
    </svg>
  ),
  settings: () => (
    <svg {...iconProps}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  ),
  building: () => (
    <svg {...iconProps}>
      <rect width="16" height="20" x="4" y="2" rx="2" />
      <path d="M9 22v-4h6v4" />
      <line x1="8" y1="6" x2="8" y2="6.01" />
      <line x1="12" y1="6" x2="12" y2="6.01" />
      <line x1="16" y1="6" x2="16" y2="6.01" />
      <line x1="8" y1="10" x2="8" y2="10.01" />
      <line x1="12" y1="10" x2="12" y2="10.01" />
      <line x1="16" y1="10" x2="16" y2="10.01" />
      <line x1="8" y1="14" x2="8" y2="14.01" />
      <line x1="12" y1="14" x2="12" y2="14.01" />
      <line x1="16" y1="14" x2="16" y2="14.01" />
    </svg>
  ),
  pieChart: () => (
    <svg {...iconProps}>
      <path d="M21.21 15.89A10 10 0 1 1 8 2.83" />
      <path d="M22 12A10 10 0 0 0 12 2v10z" />
    </svg>
  ),
};

// ── Toggle Switch ────────────────────────────────────────────────────────────

function ToggleSwitch({
  on,
  disabled,
  onChange,
}: {
  on: boolean;
  disabled?: boolean;
  onChange: () => void;
}) {
  return (
    <Button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onChange();
      }}
      className={`
        relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent
        transition-colors duration-200 ease-in-out
        focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--dg-color-brand)] focus-visible:ring-offset-2
        ${on ? "bg-[var(--dg-color-brand)]" : "bg-[var(--dg-color-border)]"}
        ${disabled ? "opacity-40 cursor-default" : "cursor-pointer"}
      `}
    >
      <span
        className={`
          pointer-events-none inline-block h-5 w-5 rounded-full bg-[var(--dg-color-text-inverse)] shadow-sm ring-0
          transition-transform duration-200 ease-in-out
          ${on ? "translate-x-5" : "translate-x-0"}
        `}
      />
    </Button>
  );
}

// ── Module Row ───────────────────────────────────────────────────────────────

function ModuleRow({
  mod,
  perms,
  lockedFalseSet,
  onToggleView,
  onToggleEdit,
}: {
  mod: PermissionModule;
  perms: AdminPermissions;
  lockedFalseSet: Set<keyof AdminPermissions>;
  onToggleView: () => void;
  onToggleEdit: () => void;
}) {
  const Icon = MODULE_ICONS[mod.icon];

  const hasView = mod.viewKeys.length > 0 || mod.alwaysOnView;
  const hasEdit = mod.editKeys.length > 0;

  const allEditLocked = mod.editKeys.length > 0 && mod.editKeys.every((k) => lockedFalseSet.has(k));
  const allViewLocked = mod.viewKeys.length > 0 && mod.viewKeys.every((k) => lockedFalseSet.has(k));
  if (allEditLocked && (mod.viewKeys.length === 0 || allViewLocked) && !mod.alwaysOnView)
    return null;

  const viewOn =
    mod.alwaysOnView || (mod.viewKeys.length > 0 && mod.viewKeys.every((k) => perms[k] === true));
  const editOn = mod.editKeys.length > 0 && mod.editKeys.every((k) => perms[k] === true);

  const viewDisabled = mod.alwaysOnView || allViewLocked;
  const editDisabled = allEditLocked;

  const viewImplied =
    mod.viewKeys.length > 0 &&
    mod.viewKeys.every((vk) => {
      const pair = VIEW_EDIT_PAIRS.find((p) => p.view === vk);
      return pair ? perms[pair.edit] === true : false;
    });

  const isActive = viewOn || editOn;

  return (
    <div className="grid grid-cols-1 md:grid-cols-12 gap-4 px-6 py-4 hover:bg-[var(--dg-color-bg)] transition-colors items-center">
      {/* Module info */}
      <div className="col-span-1 md:col-span-8 flex items-start">
        <div
          className={`p-2 rounded-lg mr-4 shrink-0 ${isActive ? "bg-[var(--dg-color-brand-bg)] text-[var(--dg-color-brand)]" : "bg-[var(--dg-color-bg-secondary)] text-[var(--dg-color-text-faint)]"}`}
        >
          <Icon />
        </div>
        <div>
          <h4 className="font-medium text-[14px] text-[var(--dg-color-text-primary)]">
            {mod.title}
          </h4>
          <p className="text-[13px] text-[var(--dg-color-text-muted)] mt-0.5 pr-4 leading-relaxed">
            {mod.description}
          </p>
        </div>
      </div>

      {/* Toggles */}
      <div className="col-span-1 md:col-span-4 grid grid-cols-2 gap-4 mt-3 md:mt-0 pt-3 md:pt-0 border-t md:border-t-0 border-[var(--dg-color-border-light)]">
        <div className="flex flex-col items-center justify-center gap-1.5">
          <span className="md:hidden text-[11px] font-medium text-[var(--dg-color-text-subtle)] uppercase">
            View
          </span>
          {hasView ? (
            <ToggleSwitch
              on={viewOn}
              disabled={viewDisabled || viewImplied}
              onChange={onToggleView}
            />
          ) : (
            <span className="text-[13px] text-[var(--dg-color-text-faint)]">—</span>
          )}
        </div>
        <div className="flex flex-col items-center justify-center gap-1.5">
          <span className="md:hidden text-[11px] font-medium text-[var(--dg-color-text-subtle)] uppercase">
            Edit
          </span>
          {hasEdit ? (
            <ToggleSwitch on={editOn} disabled={editDisabled} onChange={onToggleEdit} />
          ) : (
            <span className="text-[13px] text-[var(--dg-color-text-faint)]">—</span>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Component ────────────────────────────────────────────────────────────────

interface PermissionsEditorProps {
  title: string;
  subtitle: React.ReactNode;
  initialPermissions: AdminPermissions | null | undefined;
  showPermissionCounter?: boolean;
  lockedFalse?: (keyof AdminPermissions)[];
  onSave: (perms: AdminPermissions) => Promise<void>;
  onClose: () => void;
  buildReview?: (perms: AdminPermissions) => PermissionReviewConfig | null;
}

export default function PermissionsEditor({
  title,
  subtitle,
  initialPermissions,
  showPermissionCounter,
  lockedFalse,
  onSave,
  onClose,
  buildReview,
}: PermissionsEditorProps) {
  const lockedFalseKeys = lockedFalse ?? EMPTY_LOCKED_FALSE;
  const lockedFalseSet = useMemo(() => new Set(lockedFalseKeys), [lockedFalseKeys]);
  const initialPerms = useMemo(
    () => buildInitialPermissions(initialPermissions, lockedFalseKeys),
    [initialPermissions, lockedFalseKeys],
  );
  const [perms, setPerms] = useState<AdminPermissions>(initialPerms);
  const [saving, setSaving] = useState(false);
  const [reviewConfig, setReviewConfig] = useState<PermissionReviewConfig | null>(null);

  useEffect(() => {
    setPerms(initialPerms);
  }, [initialPerms]);

  function toggleKeys(keys: (keyof AdminPermissions)[], direction: "view" | "edit") {
    setPerms((prev) => {
      const next = { ...prev } as unknown as Record<string, boolean>;
      const allOn = keys.every((k) => prev[k] === true);
      const newVal = !allOn;

      for (const key of keys) {
        if (ALWAYS_ON_KEYS.has(key) || lockedFalseSet.has(key)) continue;
        next[key] = newVal;
      }

      if (direction === "edit" && newVal) {
        for (const key of keys) {
          const pair = VIEW_EDIT_PAIRS.find((p) => p.edit === key);
          if (pair) next[pair.view] = true;
        }
      } else if (direction === "view" && !newVal) {
        for (const key of keys) {
          const pair = VIEW_EDIT_PAIRS.find((p) => p.view === key);
          if (pair) next[pair.edit] = false;
        }
      }

      return next as unknown as AdminPermissions;
    });
  }

  const allKeys = PERMISSION_MODULES.flatMap((m) => [...m.viewKeys, ...m.editKeys]).filter(
    (k) => !lockedFalseSet.has(k) && !ALWAYS_ON_KEYS.has(k),
  );
  const hasChanges = allKeys.some((key) => perms[key] !== initialPerms[key]);
  const { requestClose, unsavedChangesDialog } = useUnsavedChangesPrompt({
    hasUnsavedChanges: hasChanges,
    onDiscard: onClose,
  });
  const handleRequestClose = () => {
    if (!saving && requestClose()) {
      onClose();
    }
  };

  function selectAll() {
    setPerms((prev) => {
      const next = { ...prev } as unknown as Record<string, boolean>;
      for (const key of allKeys) next[key] = true;
      return next as unknown as AdminPermissions;
    });
  }

  function clearAll() {
    setPerms((prev) => {
      const next = { ...prev } as unknown as Record<string, boolean>;
      for (const key of allKeys) next[key] = false;
      return next as unknown as AdminPermissions;
    });
  }

  async function performSave() {
    setSaving(true);
    try {
      await onSave(perms);
      setReviewConfig(null);
      onClose();
    } catch (err: unknown) {
      toast.error(formatClientErrorMessage(err, "We couldn't update those permissions."));
    } finally {
      setSaving(false);
    }
  }

  function handleSave() {
    if (!hasChanges) return;
    if (!buildReview) {
      void performSave();
      return;
    }

    const nextReview = buildReview(perms);
    if (!nextReview || nextReview.changes.length === 0) {
      void performSave();
      return;
    }

    setReviewConfig(nextReview);
  }

  const enabledCount = allKeys.filter((k) => perms[k] === true).length;

  const groupedModules = CATEGORY_ORDER.map((cat) => ({
    category: cat,
    label: CATEGORY_LABELS[cat],
    modules: PERMISSION_MODULES.filter((m) => m.category === cat),
  })).filter((g) =>
    g.modules.some((m) => {
      const allEditLocked = m.editKeys.length > 0 && m.editKeys.every((k) => lockedFalseSet.has(k));
      const allViewLocked = m.viewKeys.length > 0 && m.viewKeys.every((k) => lockedFalseSet.has(k));
      if (allEditLocked && (m.viewKeys.length === 0 || allViewLocked) && !m.alwaysOnView)
        return false;
      return true;
    }),
  );

  return (
    <>
      <Modal
        title={title}
        onClose={onClose}
        onRequestClose={() => !saving && requestClose()}
        style={{ maxWidth: 680 }}
      >
        <div className="flex flex-col flex-1 min-h-0">
          {/* ── Header ──────────────────────────────────────────────────── */}
          <div className="px-6 py-4 border-b border-[var(--dg-color-border-light)] bg-[var(--dg-color-bg)] shrink-0">
            <p className="text-[14px] text-[var(--dg-color-text-muted)] leading-relaxed">
              {subtitle}
            </p>
            {showPermissionCounter && (
              <p className="text-[12px] text-[var(--dg-color-text-faint)] mt-1">
                {enabledCount} of {allKeys.length} permissions enabled
              </p>
            )}
            <div className="flex gap-2 mt-3">
              <Button className="dg-btn dg-btn-ghost" onClick={selectAll} style={{ fontSize: 12 }}>
                Select All
              </Button>
              <Button className="dg-btn dg-btn-ghost" onClick={clearAll} style={{ fontSize: 12 }}>
                Clear All
              </Button>
            </div>
          </div>

          {/* ── Scrollable content ──────────────────────────────────────── */}
          <div className="flex-1 overflow-y-auto min-h-0">
            {/* Column headers — desktop only */}
            <div className="hidden md:grid grid-cols-12 gap-4 px-6 py-3 border-b border-[var(--dg-color-border-light)] text-[11px] font-semibold text-[var(--dg-color-text-subtle)] uppercase tracking-wider">
              <div className="col-span-8">Module & Access Level</div>
              <div className="col-span-2 text-center">View</div>
              <div className="col-span-2 text-center">Edit</div>
            </div>

            {groupedModules.map((group) => (
              <div key={group.category} className="pb-1">
                {/* Category header */}
                <div className="px-6 py-3 bg-[var(--dg-color-bg)]">
                  <h3 className="text-[13px] font-semibold text-[var(--dg-color-text-secondary)] uppercase tracking-wider">
                    {group.label}
                  </h3>
                </div>

                {/* Module rows */}
                <div className="divide-y divide-[var(--dg-color-border-light)]">
                  {group.modules.map((mod) => (
                    <ModuleRow
                      key={mod.id}
                      mod={mod}
                      perms={perms}
                      lockedFalseSet={lockedFalseSet}
                      onToggleView={() => toggleKeys(mod.viewKeys, "view")}
                      onToggleEdit={() => toggleKeys(mod.editKeys, "edit")}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* ── Footer ──────────────────────────────────────────────────── */}
          <EditorActionRow
            className="px-6 py-4 shrink-0 border-t border-[var(--dg-color-border-light)]"
            secondaryAction={
              <Button
                className="dg-btn dg-btn-secondary"
                onClick={handleRequestClose}
                disabled={saving}
              >
                {EDITOR_ACTION_LABELS.close}
              </Button>
            }
            primaryAction={
              <Button
                className="dg-btn dg-btn-primary"
                onClick={handleSave}
                disabled={saving || !hasChanges}
              >
                <ButtonLoading loading={saving} spinnerSize={16}>
                  {EDITOR_ACTION_LABELS.save}
                </ButtonLoading>
              </Button>
            }
          />
        </div>
      </Modal>
      {unsavedChangesDialog}
      {reviewConfig ? (
        <ChangeReviewModal
          title={reviewConfig.title}
          description={reviewConfig.description}
          changes={reviewConfig.changes}
          saving={saving}
          confirmLabel={reviewConfig.confirmLabel}
          warningText={reviewConfig.warningText}
          onCancel={() => {
            if (!saving) setReviewConfig(null);
          }}
          onConfirm={() => performSave()}
        />
      ) : null}
    </>
  );
}

/** Count how many configurable permissions are enabled in an AdminPermissions object. */
export function countEnabledPermissions(perms: AdminPermissions | null | undefined): {
  enabled: number;
  total: number;
} {
  const allKeys = PERMISSION_MODULES.flatMap((m) => [...m.viewKeys, ...m.editKeys]).filter(
    (k) => !ALWAYS_ON_KEYS.has(k),
  );
  const total = allKeys.length;
  if (!perms) return { enabled: 0, total };
  const enabled = allKeys.filter((k) => perms[k] === true).length;
  return { enabled, total };
}
