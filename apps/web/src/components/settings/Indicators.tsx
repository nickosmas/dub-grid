"use client";

import React, { useEffect, useRef, useState } from "react";
import { IndicatorType } from "@/types";
import {
  deleteIndicatorType,
  upsertIndicatorType,
} from "@/features/settings/client";
import { toast } from "sonner";
import * as Sentry from "@/lib/sentry";
import ConfirmDialog from "@/components/ConfirmDialog";
import { useMediaQuery, MOBILE } from "@/hooks";
import { EditorActionRow } from "@/components/ui/editor-action-row";
import { getEditorDismissLabel, getEditorSaveLabel } from "@/components/ui/editor-action-labels";
import { useUnsavedChangesPrompt } from "@/components/ui/use-unsaved-changes-prompt";
import { getLineTextError, normalizeLineText } from "@/lib/form-validation";
import { inputStyle } from "./shared";
import { EmptyState } from "@/components/EmptyState";

type LocalIndicator = IndicatorType & { isNew?: boolean };

export default function Indicators({
  indicatorTypes,
  orgId,
  onChange,
  canManageIndicatorTypes,
}: {
  indicatorTypes: IndicatorType[];
  orgId: string;
  onChange: (types: IndicatorType[]) => void;
  canManageIndicatorTypes: boolean;
}) {
  const isMobile = useMediaQuery(MOBILE);
  const [local, setLocal] = useState<LocalIndicator[]>(indicatorTypes);
  const [saving, setSaving] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const nextTmpId = useRef(-1);
  const originalRef = useRef<Map<number, IndicatorType>>(
    new Map(indicatorTypes.map((indicator) => [indicator.id, indicator])),
  );
  const newIndicatorDefaultsRef = useRef<Map<number, LocalIndicator>>(new Map());
  const pendingExitRef = useRef<
    | { type: "open"; indicatorId: number }
    | { type: "add" }
    | null
  >(null);

  useEffect(() => {
    originalRef.current = new Map(indicatorTypes.map((indicator) => [indicator.id, indicator]));
    setLocal((prev) => {
      const unsaved = prev.filter((indicator) => indicator.isNew);
      return [...indicatorTypes, ...unsaved];
    });
  }, [indicatorTypes]);

  const isIndicatorDirty = (indicator: LocalIndicator) => {
    const original = originalRef.current.get(indicator.id);
    return (
      indicator.isNew ||
      !original ||
      indicator.name.trim() !== original.name ||
      indicator.color !== original.color
    );
  };

  const resetIndicatorDraft = (indicator: LocalIndicator) => {
    if (indicator.isNew) {
      const initialDraft = newIndicatorDefaultsRef.current.get(indicator.id);
      if (!initialDraft) return;
      setLocal((prev) => prev.map((entry) => (entry.id === indicator.id ? { ...initialDraft } : entry)));
      return;
    }

    const original = originalRef.current.get(indicator.id);
    if (!original) return;
    setLocal((prev) => prev.map((entry) => (entry.id === indicator.id ? original : entry)));
  };

  const discardIndicatorChanges = (indicator: LocalIndicator, closeAfter: boolean) => {
    if (indicator.isNew) {
      if (closeAfter) {
        newIndicatorDefaultsRef.current.delete(indicator.id);
        setLocal((prev) => prev.filter((entry) => entry.id !== indicator.id));
      } else {
        resetIndicatorDraft(indicator);
      }
    } else {
      resetIndicatorDraft(indicator);
    }

    if (closeAfter) {
      setEditingId(null);
    }
  };

  const createDraftIndicator = () => {
    const tmp: LocalIndicator = {
      id: nextTmpId.current--,
      orgId,
      name: "",
      color: "var(--color-brand)",
      sortOrder: local.length,
      isNew: true,
    };
    newIndicatorDefaultsRef.current.set(tmp.id, tmp);
    setLocal((prev) => [...prev, tmp]);
    setEditingId(tmp.id);
  };

  const completePendingExit = () => {
    const pending = pendingExitRef.current;
    pendingExitRef.current = null;
    if (!pending) return;
    if (pending.type === "open") {
      setEditingId(pending.indicatorId);
      return;
    }
    createDraftIndicator();
  };

  const currentEditingIndicator = editingId == null
    ? null
    : local.find((indicator) => indicator.id === editingId) ?? null;
  const hasUnsavedEditingChanges = currentEditingIndicator ? isIndicatorDirty(currentEditingIndicator) : false;

  const { requestClose: requestEditorClose, unsavedChangesDialog } = useUnsavedChangesPrompt({
    hasUnsavedChanges: hasUnsavedEditingChanges,
    onDiscard: () => {
      if (!currentEditingIndicator) return;
      discardIndicatorChanges(currentEditingIndicator, true);
      completePendingExit();
    },
  });

  const attemptOpenIndicator = (indicatorId: number) => {
    if (editingId === indicatorId) return;
    if (hasUnsavedEditingChanges) {
      pendingExitRef.current = { type: "open", indicatorId };
      if (!requestEditorClose()) return;
      pendingExitRef.current = null;
    }
    setEditingId(indicatorId);
  };

  const handleAdd = () => {
    if (hasUnsavedEditingChanges) {
      pendingExitRef.current = { type: "add" };
      if (!requestEditorClose()) return;
      pendingExitRef.current = null;
    }
    createDraftIndicator();
  };

  const handleSave = async (indicator: LocalIndicator) => {
    const nameError = getLineTextError(indicator.name, {
      label: "Indicator name",
      maxLength: 50,
      required: true,
      disallowUrl: true,
    });
    const duplicateName =
      indicator.name.trim().length > 0 &&
      local.some(
        (candidate) =>
          candidate.id !== indicator.id &&
          candidate.name.trim().toLowerCase() === indicator.name.trim().toLowerCase(),
      );
    if (nameError || duplicateName) return;
    setSaving(indicator.id);
    try {
      const saved = await upsertIndicatorType({
        id: indicator.isNew ? undefined : indicator.id,
        orgId,
        name: normalizeLineText(indicator.name, {
          label: "Indicator name",
          maxLength: 50,
          required: true,
          disallowUrl: true,
        }),
        color: indicator.color,
        sortOrder: indicator.sortOrder,
      });
      if (indicator.isNew) {
        newIndicatorDefaultsRef.current.delete(indicator.id);
      }
      originalRef.current.set(saved.id, saved);
      const updated = local.map((entry) => (entry.id === indicator.id ? saved : entry));
      setLocal(updated);
      setEditingId(saved.id);
      onChange(updated);
      toast.success("Indicator saved");
    } catch (err) {
      toast.error("Failed to save indicator");
      Sentry.captureException(err);
    } finally {
      setSaving(null);
    }
  };

  const handleClose = (indicator: LocalIndicator) => {
    if (indicator.isNew) {
      newIndicatorDefaultsRef.current.delete(indicator.id);
      setLocal((prev) => prev.filter((entry) => entry.id !== indicator.id));
    }
    setEditingId(null);
  };

  const handleDelete = async (indicator: LocalIndicator) => {
    if (indicator.isNew) {
      newIndicatorDefaultsRef.current.delete(indicator.id);
      setLocal((prev) => prev.filter((entry) => entry.id !== indicator.id));
      if (editingId === indicator.id) {
        setEditingId(null);
      }
      return;
    }
    setDeleting(indicator.id);
    try {
      await deleteIndicatorType(indicator.id, orgId);
      const updated = local.filter((entry) => entry.id !== indicator.id);
      setLocal(updated);
      onChange(updated);
      if (editingId === indicator.id) {
        setEditingId(null);
      }
      toast.success("Indicator deleted");
    } catch (err) {
      toast.error("Failed to delete indicator");
      Sentry.captureException(err);
    } finally {
      setDeleting(null);
      setConfirmDeleteId(null);
    }
  };

  const handleChange = (id: number, field: "name" | "color", value: string) => {
    setLocal((prev) => prev.map((indicator) => (indicator.id === id ? { ...indicator, [field]: value } : indicator)));
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      {local.length === 0 && (
        <EmptyState
          compact
          title="No indicators defined yet"
          action={canManageIndicatorTypes ? (
            <button
              onClick={handleAdd}
              className="dg-btn dg-btn-dashed dg-btn-sm"
              style={{ width: "100%" }}
            >
              + Add Indicator
            </button>
          ) : undefined}
        />
      )}
      {local.map((indicator) => {
        const isEditing = editingId === indicator.id;
        const isSavingThis = saving === indicator.id;
        const isDeletingThis = deleting === indicator.id;
        const isDirty = isIndicatorDirty(indicator);
        const nameError =
          indicator.name.trim().length > 0
            ? getLineTextError(indicator.name, {
                label: "Indicator name",
                maxLength: 50,
                required: true,
                disallowUrl: true,
              })
            : null;
        const duplicateName =
          indicator.name.trim().length > 0 &&
          local.some(
            (candidate) =>
              candidate.id !== indicator.id &&
              candidate.name.trim().toLowerCase() === indicator.name.trim().toLowerCase(),
          );

        if (!isEditing) {
          return (
            <div
              key={indicator.id}
              className="dg-hover-row"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                padding: "10px 8px",
                borderBottom: "1px solid var(--color-border-light)",
                borderRadius: "var(--dg-radius-md)",
                transition: "background 0.15s",
                cursor: canManageIndicatorTypes ? "pointer" : undefined,
              }}
              onClick={canManageIndicatorTypes ? () => attemptOpenIndicator(indicator.id) : undefined}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                <span
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: "50%",
                    background: indicator.color,
                    border: "1px solid rgba(0,0,0,0.12)",
                    flexShrink: 0,
                  }}
                />
                <span style={{ fontSize: "var(--dg-fs-label)", fontWeight: 700, color: "var(--color-text-primary)" }}>
                  {indicator.name || <span style={{ color: "var(--color-text-muted)", fontStyle: "italic", fontWeight: 400 }}>Untitled</span>}
                </span>
              </div>
              {canManageIndicatorTypes && (
                <button
                  onClick={(event) => {
                    event.stopPropagation();
                    attemptOpenIndicator(indicator.id);
                  }}
                  className="dg-btn dg-btn-secondary dg-btn-sm"
                >
                  Edit
                </button>
              )}
            </div>
          );
        }

        return (
          <div
            key={indicator.id}
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 10,
              padding: "10px 0",
              borderBottom: "1px solid var(--color-border-light)",
            }}
          >
            <div
              style={{
                display: isMobile ? "flex" : "grid",
                flexDirection: isMobile ? "column" : undefined,
                gridTemplateColumns: isMobile ? undefined : "minmax(0, 1fr) auto",
                gap: 10,
                alignItems: "center",
              }}
            >
              <input
                value={indicator.name}
                onChange={(event) => handleChange(indicator.id, "name", event.target.value)}
                placeholder="Indicator name (e.g. Readings)"
                maxLength={50}
                style={{
                  ...inputStyle,
                  ...(isMobile ? { width: "100%" } : {}),
                  ...(nameError || duplicateName
                    ? { borderColor: "var(--color-danger)" }
                    : {}),
                }}
              />
              {(nameError || duplicateName) ? (
                <p
                  role="alert"
                  style={{
                    margin: "4px 0 0",
                    fontSize: "var(--dg-fs-footnote)",
                    color: "var(--color-danger)",
                  }}
                >
                  {nameError ?? "Another indicator already uses that name."}
                </p>
              ) : null}
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <input
                  type="color"
                  value={indicator.color}
                  onChange={(event) => handleChange(indicator.id, "color", event.target.value)}
                  style={{
                    width: 32,
                    height: 28,
                    border: "1px solid var(--color-border)",
                    borderRadius: 4,
                    cursor: "pointer",
                    padding: 2,
                  }}
                />
                <div
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: "50%",
                    background: indicator.color,
                    border: "1px solid rgba(0,0,0,0.12)",
                    flexShrink: 0,
                  }}
                />
              </div>
            </div>
            {canManageIndicatorTypes && (
              <EditorActionRow
                destructiveAction={(
                  <button
                    onClick={() => indicator.isNew ? handleDelete(indicator) : setConfirmDeleteId(indicator.id)}
                    disabled={isDeletingThis}
                    className="dg-btn dg-btn-danger dg-btn-sm"
                  >
                    {isDeletingThis ? "…" : "Delete"}
                  </button>
                )}
                secondaryAction={(
                  <button
                    onClick={() => isDirty ? discardIndicatorChanges(indicator, false) : handleClose(indicator)}
                    disabled={isSavingThis || isDeletingThis}
                    className="dg-btn dg-btn-secondary dg-btn-sm"
                  >
                    {getEditorDismissLabel(isDirty)}
                  </button>
                )}
                primaryAction={(
                  <button
                    onClick={() => handleSave(indicator)}
                    disabled={isSavingThis || !indicator.name.trim() || !isDirty || Boolean(nameError) || duplicateName}
                    className="dg-btn dg-btn-primary dg-btn-sm"
                  >
                    {getEditorSaveLabel(isSavingThis)}
                  </button>
                )}
              />
            )}
          </div>
        );
      })}
      {local.length > 0 && canManageIndicatorTypes && (
        <button
          onClick={handleAdd}
          className="dg-btn dg-btn-dashed dg-btn-sm"
          style={{ width: "100%", marginTop: 8 }}
        >
          + Add Indicator
        </button>
      )}
      {unsavedChangesDialog}
      {confirmDeleteId !== null && (() => {
        const indicator = local.find((entry) => entry.id === confirmDeleteId);
        if (!indicator) return null;
        return (
          <ConfirmDialog
            title="Delete Indicator?"
            message={<>Delete <strong>{indicator.name || "this indicator"}</strong>? This indicator will be removed from all shift cells.</>}
            confirmLabel="Delete"
            variant="danger"
            isLoading={deleting === confirmDeleteId}
            onConfirm={() => handleDelete(indicator)}
            onCancel={() => setConfirmDeleteId(null)}
          />
        );
      })()}
    </div>
  );
}
