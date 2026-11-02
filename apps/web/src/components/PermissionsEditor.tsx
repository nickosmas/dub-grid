"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import Modal from "@/components/Modal";

import { Button } from "@/components/Button";
import { EDITOR_ACTION_LABELS } from "@/components/ui/editor-action-labels";
import { EditorActionRow } from "@/components/ui/editor-action-row";
import { useUnsavedChangesPrompt } from "@/components/ui/use-unsaved-changes-prompt";
import ChangeReviewModal, { type ReviewChange } from "@/components/review/ChangeReviewModal";
import {
  CONFIGURABLE_PERMISSION_KEYS as CONFIGURABLE_KEYS,
  DEFAULT_PERMISSION_LABELS as DEFAULT_LABELS,
  PERMISSION_CATEGORY_LABELS as CATEGORY_LABELS,
  PERMISSION_CATEGORY_ORDER as CATEGORY_ORDER,
  PERMISSION_MODULES,
  buildInitialPermissions,
  countPermissionLevels,
  describePermissionModule as describeModule,
  editCellState,
  impliedViewNote as impliedNote,
  togglePermissionModule,
  viewCellState,
  type PermissionCellState as CellState,
  type PermissionEditorLabels,
  type PermissionModule,
} from "@dubgrid/authz";
import type { AdminPermissions } from "@/types";
import { ButtonLoading } from "@/components/ButtonSpinner";
import { formatClientErrorMessage } from "@/lib/client-facing";
import { Switch } from "@/components/ui/switch";

export type { PermissionEditorLabels, PermissionModule } from "@dubgrid/authz";

export interface PermissionReviewConfig {
  title: string;
  description: string;
  changes: ReviewChange[];
  confirmLabel?: string;
  warningText?: string;
}

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
  send: () => (
    <svg {...iconProps}>
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
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
  tag: () => (
    <svg {...iconProps}>
      <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
      <line x1="7" y1="7" x2="7.01" y2="7" />
    </svg>
  ),
  settings: () => (
    <svg {...iconProps}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  ),
  pieChart: () => (
    <svg {...iconProps}>
      <path d="M21.21 15.89A10 10 0 1 1 8 2.83" />
      <path d="M22 12A10 10 0 0 0 12 2v10z" />
    </svg>
  ),
  fileText: () => (
    <svg {...iconProps}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
    </svg>
  ),
};

function ToggleSwitch({
  on,
  label,
  onChange,
}: {
  on: boolean;
  label: string;
  onChange: () => void;
}) {
  return <Switch checked={on} ariaLabel={label} onChange={() => onChange()} />;
}

function AccessCell({
  state,
  label,
  onToggle,
}: {
  state: CellState;
  label: string;
  onToggle: () => void;
}) {
  if (state.kind === "switch") {
    return <ToggleSwitch on={state.on} label={label} onChange={onToggle} />;
  }
  if (state.kind === "text") {
    return <span className="text-[12px] text-[var(--dg-color-text-faint)]">{state.label}</span>;
  }
  return null;
}

function ModuleRow({
  mod,
  perms,
  labels,
  onToggleView,
  onToggleEdit,
}: {
  mod: PermissionModule;
  perms: AdminPermissions;
  labels: PermissionEditorLabels;
  onToggleView: () => void;
  onToggleEdit: () => void;
}) {
  const Icon = MODULE_ICONS[mod.icon];
  const view = viewCellState(mod, perms);
  const edit = editCellState(mod, perms);
  const isActive =
    (view.kind === "switch" && view.on) ||
    (view.kind === "text" && view.label !== "Off") ||
    (edit.kind === "switch" && edit.on);
  const note = impliedNote(mod, perms) ?? mod.note;

  return (
    <div className="grid grid-cols-1 md:grid-cols-12 gap-4 px-6 py-4 hover:bg-[var(--dg-color-bg)] transition-colors items-center">
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
            {describeModule(mod, labels)}
          </p>
          {note && (
            <p className="text-[12px] text-[var(--dg-color-text-faint)] mt-1 pr-4 leading-relaxed">
              {note}
            </p>
          )}
        </div>
      </div>

      <div className="col-span-1 md:col-span-4 grid grid-cols-2 gap-4 mt-3 md:mt-0 pt-3 md:pt-0 border-t md:border-t-0 border-[var(--dg-color-border-light)]">
        <div className="flex flex-col items-center justify-center gap-1.5 text-center">
          <span className="dg-type-table-heading md:hidden">View</span>
          <AccessCell state={view} label={`${mod.title} view`} onToggle={onToggleView} />
        </div>
        <div className="flex flex-col items-center justify-center gap-1.5 text-center">
          <span className="dg-type-table-heading md:hidden">Edit</span>
          <AccessCell state={edit} label={`${mod.title} edit`} onToggle={onToggleEdit} />
        </div>
      </div>
    </div>
  );
}

interface PermissionsEditorProps {
  title: string;
  subtitle: React.ReactNode;
  initialPermissions: AdminPermissions | null | undefined;
  showPermissionCounter?: boolean;
  labels?: Partial<PermissionEditorLabels>;
  /** Resolving `false` means the save was cancelled, so the editor stays open. */
  onSave: (perms: AdminPermissions) => Promise<void | boolean>;
  /** True while a step-up dialog takes over the save; the review then hides. */
  obscured?: boolean;
  onClose: () => void;
  /**
   * `initial` is the resolved starting set (stored row over the admin
   * baseline), so a review compares real access rather than a raw row that
   * may be null.
   */
  buildReview?: (
    perms: AdminPermissions,
    initial: AdminPermissions,
  ) => PermissionReviewConfig | null;
}

export default function PermissionsEditor({
  title,
  subtitle,
  initialPermissions,
  showPermissionCounter,
  labels,
  onSave,
  onClose,
  buildReview,
  obscured = false,
}: PermissionsEditorProps) {
  const initialPerms = useMemo(
    () => buildInitialPermissions(initialPermissions),
    [initialPermissions],
  );
  const [perms, setPerms] = useState<AdminPermissions>(initialPerms);
  const [saving, setSaving] = useState(false);
  const [reviewConfig, setReviewConfig] = useState<PermissionReviewConfig | null>(null);
  const resolvedLabels: PermissionEditorLabels = {
    focusAreaLabel: labels?.focusAreaLabel || DEFAULT_LABELS.focusAreaLabel,
    certificationLabel: labels?.certificationLabel || DEFAULT_LABELS.certificationLabel,
    roleLabel: labels?.roleLabel || DEFAULT_LABELS.roleLabel,
  };

  useEffect(() => {
    setPerms(initialPerms);
  }, [initialPerms]);

  // While Edit is on the View cell reads "Included" and cannot be switched off.
  function toggleModule(mod: PermissionModule, direction: "view" | "edit") {
    setPerms((prev) => togglePermissionModule(prev, mod, direction));
  }

  const hasChanges = CONFIGURABLE_KEYS.some((key) => perms[key] !== initialPerms[key]);
  const { requestClose, unsavedChangesDialog } = useUnsavedChangesPrompt({
    hasUnsavedChanges: hasChanges,
    onDiscard: onClose,
  });
  const handleRequestClose = () => {
    if (!saving && requestClose()) {
      onClose();
    }
  };

  function setAll(value: boolean) {
    setPerms((prev) => {
      const next = { ...prev };
      for (const key of CONFIGURABLE_KEYS) next[key] = value;
      return next;
    });
  }

  async function performSave() {
    setSaving(true);
    try {
      if ((await onSave(perms)) === false) return;
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

    const nextReview = buildReview(perms, initialPerms);
    if (!nextReview || nextReview.changes.length === 0) {
      void performSave();
      return;
    }

    setReviewConfig(nextReview);
  }

  const levelCount = countPermissionLevels(perms);

  const groupedModules = CATEGORY_ORDER.map((cat) => ({
    category: cat,
    label: CATEGORY_LABELS[cat],
    modules: PERMISSION_MODULES.filter((m) => m.category === cat),
  }));

  return (
    <>
      <Modal
        title={title}
        onClose={onClose}
        onRequestClose={() => !saving && requestClose()}
        style={{ maxWidth: 680 }}
        footer={
          <EditorActionRow
            className="px-6"
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
        }
      >
        <div className="flex flex-col flex-1 min-h-0">
          <div className="px-6 py-4 border-b border-[var(--dg-color-border-light)] bg-[var(--dg-color-bg)] shrink-0">
            <p className="text-[14px] text-[var(--dg-color-text-muted)] leading-relaxed">
              {subtitle}
            </p>
            {showPermissionCounter && (
              <p className="text-[12px] text-[var(--dg-color-text-faint)] mt-1">
                {levelCount.enabled} of {levelCount.total} turned on
              </p>
            )}
            <div className="flex gap-2 mt-3">
              <Button
                className="dg-btn dg-btn-ghost"
                onClick={() => setAll(true)}
                style={{ fontSize: 12 }}
              >
                Select all
              </Button>
              <Button
                className="dg-btn dg-btn-ghost"
                onClick={() => setAll(false)}
                style={{ fontSize: 12 }}
              >
                Clear all
              </Button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto min-h-0">
            <div className="dg-type-table-heading hidden grid-cols-12 gap-4 border-b border-[var(--dg-color-border-light)] px-6 py-3 md:grid">
              <div className="col-span-8">Permission</div>
              <div className="col-span-2 text-center">View</div>
              <div className="col-span-2 text-center">Edit</div>
            </div>

            {groupedModules.map((group) => (
              <div key={group.category} className="pb-1">
                <div className="px-6 py-3 bg-[var(--dg-color-bg)]">
                  <h3 className="dg-type-content-group-heading">{group.label}</h3>
                </div>

                <div className="divide-y divide-[var(--dg-color-border-light)]">
                  {group.modules.map((mod) => (
                    <ModuleRow
                      key={mod.id}
                      mod={mod}
                      perms={perms}
                      labels={resolvedLabels}
                      onToggleView={() => toggleModule(mod, "view")}
                      onToggleEdit={() => toggleModule(mod, "edit")}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </Modal>
      {unsavedChangesDialog}
      {reviewConfig && !obscured ? (
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
