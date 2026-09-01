"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";
import type { AbsenceType, ShiftDisplayMode } from "@/types";
import { Button } from "@/components/Button";
import {
  checkAbsenceTypeDependencies,
  deleteAbsenceType,
  upsertAbsenceType,
} from "@/features/settings/client";
import type { DependencyInfo } from "@/features/settings/client";
import { toast } from "sonner";
import * as Sentry from "@/lib/sentry";
import { useMediaQuery, MOBILE } from "@/hooks";
import ConfirmDialog from "@/components/ConfirmDialog";
import { EmptyState } from "@/components/EmptyState";
import { EditorActionRow } from "@/components/ui/editor-action-row";
import { EDITOR_ACTION_LABELS, getEditorDismissLabel } from "@/components/ui/editor-action-labels";
import { ButtonLoading } from "@/components/ButtonSpinner";
import { useUnsavedChangesPrompt } from "@/components/ui/use-unsaved-changes-prompt";
import {
  getCodeError,
  getLineTextError,
  normalizeCode,
  normalizeLineText,
} from "@/lib/form-validation";
import { PresetColorPicker, labelStyle } from "./shared";
import {
  PREDEFINED_COLORS,
  TRANSPARENT_BORDER,
  borderColor,
  resolveShiftPillColors,
} from "@/lib/colors";
import { formatClientErrorMessage } from "@/lib/client-facing";

type AbsenceTypeFormState = {
  label: string;
  name: string;
  color: string;
  border: string;
  text: string;
};

function buildFormState(type: AbsenceType): AbsenceTypeFormState {
  return {
    label: type.label,
    name: type.name,
    color: type.color === "transparent" ? PREDEFINED_COLORS[0].bg : type.color,
    border: type.border === "transparent" ? TRANSPARENT_BORDER : type.border,
    text: type.text === "transparent" ? PREDEFINED_COLORS[0].text : type.text,
  };
}

function serializeFormState(form: AbsenceTypeFormState): string {
  return JSON.stringify({
    label: form.label.trim().toUpperCase(),
    name: form.name.trim(),
    color: form.color,
    border: form.border,
    text: form.text,
  });
}

function AbsenceTypeRow({
  absenceType,
  orgId,
  onSaved,
  onDeleted,
  canEdit,
  allTypes,
  shiftDisplayMode,
  isLast,
}: {
  absenceType: AbsenceType & { isNew?: boolean };
  orgId: string;
  onSaved: (saved: AbsenceType, previousId: number) => void;
  onDeleted: (id: number) => void;
  canEdit: boolean;
  allTypes: Array<AbsenceType & { isNew?: boolean }>;
  shiftDisplayMode: ShiftDisplayMode;
  isLast?: boolean;
}) {
  const isNameMode = shiftDisplayMode === "name";
  const isMobile = useMediaQuery(MOBILE);
  const { resolvedTheme } = useTheme();
  const isDarkTheme = resolvedTheme === "dark";
  const [form, setForm] = useState<AbsenceTypeFormState>(() => buildFormState(absenceType));
  const [expanded, setExpanded] = useState(!!absenceType.isNew);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [dependencyInfo, setDependencyInfo] = useState<DependencyInfo | null>(null);
  const editorId = React.useId();

  // Only resync from props when the editor is closed. Preserves the user's
  // in-progress edits across parent re-renders that pass a new `absenceType`
  // reference with identical data.
  useEffect(() => {
    if (!expanded && !absenceType.isNew) {
      setForm(buildFormState(absenceType));
    }
  }, [absenceType, expanded]);

  const isDirty =
    absenceType.isNew ||
    serializeFormState(form) !== serializeFormState(buildFormState(absenceType));
  const duplicateLabel =
    form.label.trim().length > 0 &&
    allTypes.some(
      (candidate) =>
        candidate.id !== absenceType.id &&
        candidate.label.trim().toUpperCase() === form.label.trim().toUpperCase(),
    );
  const labelError =
    form.label.trim().length > 0 || !isNameMode
      ? getCodeError(form.label, {
          label: "Absence code",
          maxLength: 6,
          required: !isNameMode,
          uppercase: true,
        })
      : null;
  const nameError =
    form.name.trim().length > 0
      ? getLineTextError(form.name, {
          label: "Absence name",
          maxLength: 50,
          required: true,
          disallowUrl: true,
        })
      : null;
  const canSave =
    isDirty &&
    !!form.name.trim() &&
    (isNameMode || !!form.label.trim()) &&
    !duplicateLabel &&
    !labelError &&
    !nameError;

  const discardDraft = useCallback(
    (closeAfter: boolean) => {
      if (absenceType.isNew && closeAfter) {
        onDeleted(absenceType.id);
        return;
      }
      setForm(buildFormState(absenceType));
      if (closeAfter) {
        setExpanded(false);
      }
    },
    [absenceType, onDeleted],
  );

  const closeEditor = useCallback(() => {
    if (absenceType.isNew) {
      onDeleted(absenceType.id);
      return;
    }
    setExpanded(false);
  }, [absenceType.id, absenceType.isNew, onDeleted]);

  const { requestClose, unsavedChangesDialog } = useUnsavedChangesPrompt({
    hasUnsavedChanges: expanded && isDirty,
    onDiscard: () => discardDraft(true),
  });

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

  const handleSave = useCallback(async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const saved = await upsertAbsenceType({
        id: absenceType.isNew ? undefined : absenceType.id,
        orgId,
        label:
          form.label.trim().length > 0 || !isNameMode
            ? normalizeCode(form.label, {
                label: "Absence code",
                maxLength: 6,
                required: !isNameMode,
                uppercase: true,
              })
            : "",
        name: normalizeLineText(form.name, {
          label: "Absence name",
          maxLength: 50,
          required: true,
          disallowUrl: true,
        }),
        color: form.color,
        border: form.border,
        text: form.text,
        sortOrder: absenceType.sortOrder,
      });
      onSaved(saved, absenceType.id);
      setExpanded(false);
      toast.success("Absence type saved");
    } catch (error) {
      Sentry.captureException(error);
      toast.error(formatClientErrorMessage(error, "We couldn't save that absence type."));
    } finally {
      setSaving(false);
    }
  }, [absenceType.id, absenceType.isNew, absenceType.sortOrder, canSave, form, onSaved, orgId]);

  const handleDeleteClick = useCallback(async () => {
    if (absenceType.isNew) {
      onDeleted(absenceType.id);
      return;
    }
    const deps = await checkAbsenceTypeDependencies(absenceType.id, orgId);
    setDependencyInfo(deps);
    setShowDeleteConfirm(true);
  }, [absenceType.id, absenceType.isNew, onDeleted, orgId]);

  const handleDelete = useCallback(
    async (hard: boolean) => {
      setDeleting(true);
      try {
        await deleteAbsenceType(absenceType.id, orgId, hard);
        onDeleted(absenceType.id);
        toast.success(hard ? "Absence type deleted" : "Absence type archived");
      } catch (error) {
        Sentry.captureException(error);
        toast.error(hard ? "Failed to delete absence type" : "Failed to archive absence type");
      } finally {
        setDeleting(false);
        setShowDeleteConfirm(false);
      }
    },
    [absenceType.id, onDeleted, orgId],
  );

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
          gap: 10,
          padding: "10px 8px",
          borderRadius: 8,
          cursor: "pointer",
          transition: "background 0.15s",
          width: "100%",
          background: "transparent",
          border: "none",
          textAlign: "left",
        }}
        onClick={toggleExpanded}
      >
        {(() => {
          const badge = resolveShiftPillColors(
            { color: form.color, text: form.text, border: form.border },
            isDarkTheme,
          );
          const previewLabel = isNameMode ? form.name : form.label;
          return (
            <span
              data-absence-type-preview={isNameMode ? "name" : "code"}
              style={{
                display: "inline-block",
                minWidth: 44,
                maxWidth: isNameMode ? 168 : undefined,
                marginRight: isNameMode ? "auto" : undefined,
                overflow: "hidden",
                padding: "3px 8px",
                background: badge.color,
                border: `1px solid ${borderColor(badge.text)}`,
                color: badge.text,
                borderRadius: 8,
                fontSize: "var(--dg-fs-caption)",
                fontWeight: 700,
                lineHeight: 1.2,
                overflowWrap: isNameMode ? "break-word" : undefined,
                textAlign: "center",
                textOverflow: isNameMode ? undefined : "ellipsis",
                whiteSpace: isNameMode ? "normal" : "nowrap",
              }}
            >
              {previewLabel || "…"}
            </span>
          );
        })()}
        {!isNameMode && (
          <span
            style={{
              flex: 1,
              fontSize: "var(--dg-fs-label)",
              fontWeight: 700,
              color: "var(--dg-color-text-primary)",
            }}
          >
            {form.name || "Untitled absence type"}
          </span>
        )}
        <span
          style={{
            fontSize: "var(--dg-fs-body-sm)",
            color: "var(--dg-color-text-faint)",
            transform: expanded ? "rotate(180deg)" : "none",
            transition: "transform 150ms ease",
          }}
        >
          ▾
        </span>
      </Button>

      {expanded && (
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
          <div
            style={{
              display: "grid",
              gridTemplateColumns: isNameMode ? "1fr" : isMobile ? "1fr" : "120px 1fr",
              gap: 10,
            }}
          >
            {!isNameMode && (
              <div>
                <label style={labelStyle}>Code / label</label>
                <input
                  value={form.label}
                  onChange={(event) => setForm((prev) => ({ ...prev, label: event.target.value }))}
                  className="dg-input"
                  maxLength={6}
                  placeholder="e.g. PTO"
                  disabled={!canEdit}
                  style={labelError ? { borderColor: "var(--dg-color-danger)" } : undefined}
                />
                {labelError ? (
                  <p
                    role="alert"
                    style={{
                      margin: "4px 0 0",
                      fontSize: "var(--dg-fs-footnote)",
                      color: "var(--dg-color-danger)",
                    }}
                  >
                    {labelError}
                  </p>
                ) : null}
              </div>
            )}
            <div>
              <label style={labelStyle}>{isNameMode ? "Absence name" : "Full name"}</label>
              <input
                value={form.name}
                onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                className="dg-input"
                maxLength={50}
                placeholder="e.g. Vacation"
                disabled={!canEdit}
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
          </div>

          <div>
            <label style={labelStyle}>Color preset</label>
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
              disabled={!canEdit}
            />
          </div>

          {duplicateLabel && (
            <p
              style={{
                color: "var(--dg-color-danger)",
                fontSize: "var(--dg-fs-caption)",
                margin: 0,
              }}
            >
              Another absence type already uses that code.
            </p>
          )}

          <EditorActionRow
            destructiveAction={
              canEdit && !absenceType.isNew ? (
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
                onClick={() =>
                  absenceType.isNew || !isDirty ? closeEditor() : discardDraft(false)
                }
                className="dg-btn dg-btn-secondary dg-btn-sm"
              >
                {getEditorDismissLabel({
                  hasUnsavedChanges: isDirty,
                  isCreating: Boolean(absenceType.isNew),
                })}
              </Button>
            }
            primaryAction={
              <Button
                onClick={handleSave}
                disabled={saving || !canSave || !canEdit}
                className="dg-btn dg-btn-primary dg-btn-sm"
              >
                <ButtonLoading loading={saving}>{EDITOR_ACTION_LABELS.save}</ButtonLoading>
              </Button>
            }
          />
        </div>
      )}

      {unsavedChangesDialog}
      {showDeleteConfirm &&
        (() => {
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
                    Archiving keeps history intact but removes the type from future scheduling.
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
                  This will permanently delete <strong>{form.name}</strong>. Nothing references it.
                </>
              }
              confirmLabel="Delete"
              variant="danger"
              isLoading={deleting}
              onConfirm={() => handleDelete(true)}
              onCancel={() => setShowDeleteConfirm(false)}
            />
          );
        })()}
    </div>
  );
}

export default function AbsenceTypesSettings({
  absenceTypes,
  orgId,
  onChange,
  canManageScheduleDefinitions,
  shiftDisplayMode = "code",
}: {
  absenceTypes: AbsenceType[];
  orgId: string;
  onChange: (types: AbsenceType[]) => void;
  canManageScheduleDefinitions: boolean;
  shiftDisplayMode?: ShiftDisplayMode;
}) {
  const [local, setLocal] = useState<Array<AbsenceType & { isNew?: boolean }>>(absenceTypes);
  const nextTmpId = useRef(-1);

  useEffect(() => {
    setLocal((previous) => {
      const unsaved = previous.filter((type) => type.isNew);
      return [...absenceTypes, ...unsaved];
    });
  }, [absenceTypes]);

  const handleAdd = useCallback(() => {
    const nextType: AbsenceType & { isNew: true } = {
      id: nextTmpId.current--,
      orgId,
      label: "",
      name: "",
      color: "#E2E8F0",
      border: "#CBD5E1",
      text: "#475569",
      sortOrder: local.length,
      archivedAt: null,
      isNew: true,
    };
    setLocal((previous) => [...previous, nextType]);
  }, [local.length, orgId]);

  const handleSaved = useCallback(
    (saved: AbsenceType, previousId: number) => {
      const updated = local.map((type) => (type.id === previousId ? saved : type));
      setLocal(updated);
      onChange(updated.filter((type) => !(type as { isNew?: boolean }).isNew));
    },
    [local, onChange],
  );

  const handleDeleted = useCallback(
    (id: number) => {
      const updated = local.filter((type) => type.id !== id);
      setLocal(updated);
      onChange(updated.filter((type) => !(type as { isNew?: boolean }).isNew));
    },
    [local, onChange],
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
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
            fontWeight: 700,
            fontSize: "var(--dg-fs-label)",
            color: "var(--dg-color-text-secondary)",
          }}
        >
          Absence Types
        </div>
        {local.length > 0 ? (
          <div style={{ padding: "0 16px" }}>
            {local.map((absenceType, absenceIndex) => (
              <AbsenceTypeRow
                key={absenceType.id}
                absenceType={absenceType}
                orgId={orgId}
                onSaved={handleSaved}
                onDeleted={handleDeleted}
                canEdit={canManageScheduleDefinitions}
                allTypes={local}
                shiftDisplayMode={shiftDisplayMode}
                isLast={absenceIndex === local.length - 1}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            size="compact"
            title="No absence types yet"
            description="Create the off-day and calloff labels your schedulers use."
            action={
              canManageScheduleDefinitions ? (
                <Button onClick={handleAdd} className="dg-btn dg-btn-secondary dg-btn-sm">
                  + Add Absence Type
                </Button>
              ) : undefined
            }
            style={{ margin: "12px 16px" }}
          />
        )}
        {local.length > 0 && canManageScheduleDefinitions && (
          <div style={{ padding: "8px 16px 12px" }}>
            <Button
              onClick={handleAdd}
              className="dg-btn dg-btn-dashed dg-btn-sm"
              style={{ width: "100%" }}
            >
              + Add Absence Type
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
