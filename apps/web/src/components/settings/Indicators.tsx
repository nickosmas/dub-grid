"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { IndicatorType } from "@/types";
import {
  checkIndicatorTypeDependencies,
  deleteIndicatorType,
  upsertIndicatorType,
} from "@/features/settings/client";
import type { DependencyInfo } from "@/features/settings/client";
import { toast } from "sonner";
import * as Sentry from "@/lib/sentry";
import ConfirmDialog from "@/components/ConfirmDialog";
import { EmptyState } from "@/components/EmptyState";
import { EditorActionRow } from "@/components/ui/editor-action-row";
import { getEditorDismissLabel, getEditorSaveLabel } from "@/components/ui/editor-action-labels";
import { useUnsavedChangesPrompt } from "@/components/ui/use-unsaved-changes-prompt";
import { getLineTextError, normalizeLineText } from "@/lib/form-validation";
import { labelStyle } from "./shared";
import { formatClientErrorMessage } from "@/lib/client-facing";

type LocalIndicator = IndicatorType & { isNew?: boolean; clientKey: string };

function IndicatorRow({
  indicator,
  orgId,
  allIndicators,
  canEdit,
  onSaved,
  onDeleted,
  isLast,
}: {
  indicator: LocalIndicator;
  orgId: string;
  allIndicators: LocalIndicator[];
  canEdit: boolean;
  onSaved: (saved: IndicatorType, previousId: number) => void;
  onDeleted: (id: number) => void;
  isLast?: boolean;
}) {
  const [name, setName] = useState(indicator.name);
  const [color, setColor] = useState(indicator.color);
  const [expanded, setExpanded] = useState(!!indicator.isNew);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [dependencyInfo, setDependencyInfo] = useState<DependencyInfo | null>(null);

  useEffect(() => {
    if (!indicator.isNew) {
      setName(indicator.name);
      setColor(indicator.color);
    }
  }, [indicator]);

  const trimmedName = name.trim();
  const isDirty =
    indicator.isNew ||
    trimmedName !== indicator.name.trim() ||
    color !== indicator.color;

  const nameError =
    trimmedName.length > 0
      ? getLineTextError(name, {
          label: "Indicator name",
          maxLength: 50,
          required: true,
          disallowUrl: true,
        })
      : null;

  const duplicateName =
    trimmedName.length > 0 &&
    !saving &&
    allIndicators.some(
      (candidate) =>
        candidate.id !== indicator.id &&
        candidate.name.trim().toLowerCase() === trimmedName.toLowerCase(),
    );

  const canSave =
    isDirty && trimmedName.length > 0 && !nameError && !duplicateName;

  const discardDraft = useCallback(
    (closeAfter: boolean) => {
      if (indicator.isNew && closeAfter) {
        onDeleted(indicator.id);
        return;
      }
      setName(indicator.name);
      setColor(indicator.color);
      if (closeAfter) setExpanded(false);
    },
    [indicator, onDeleted],
  );

  const closeEditor = useCallback(() => {
    if (indicator.isNew) {
      onDeleted(indicator.id);
      return;
    }
    setExpanded(false);
  }, [indicator.id, indicator.isNew, onDeleted]);

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
      const saved = await upsertIndicatorType({
        id: indicator.isNew ? undefined : indicator.id,
        orgId,
        name: normalizeLineText(name, {
          label: "Indicator name",
          maxLength: 50,
          required: true,
          disallowUrl: true,
        }),
        color,
        sortOrder: indicator.sortOrder,
      });
      setExpanded(false);
      onSaved(saved, indicator.id);
      toast.success("Indicator saved");
    } catch (error) {
      Sentry.captureException(error);
      toast.error(formatClientErrorMessage(error, "We couldn't save that indicator."));
    } finally {
      setSaving(false);
    }
  }, [canSave, color, indicator.id, indicator.isNew, indicator.sortOrder, name, onSaved, orgId]);

  const handleDeleteClick = useCallback(async () => {
    if (indicator.isNew) {
      onDeleted(indicator.id);
      return;
    }
    const deps = await checkIndicatorTypeDependencies(indicator.id, orgId);
    setDependencyInfo(deps);
    setShowDeleteConfirm(true);
  }, [indicator.id, indicator.isNew, onDeleted, orgId]);

  const handleDelete = useCallback(async (hard: boolean) => {
    setDeleting(true);
    try {
      await deleteIndicatorType(indicator.id, orgId, hard);
      onDeleted(indicator.id);
      toast.success(hard ? "Indicator deleted" : "Indicator archived");
    } catch (error) {
      Sentry.captureException(error);
      toast.error(hard ? "Failed to delete indicator" : "Failed to archive indicator");
    } finally {
      setDeleting(false);
      setShowDeleteConfirm(false);
    }
  }, [indicator.id, onDeleted, orgId]);

  return (
    <div
      className="dg-list-row"
      style={{
        borderBottom: isLast ? "none" : "1px solid",
        borderBottomColor: expanded || isLast ? "transparent" : "var(--color-border-light)",
        transition: "border-bottom-color 220ms ease",
      }}
    >
      <div
        className="dg-hover-row"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "10px 8px",
          borderRadius: 8,
          cursor: "pointer",
          transition: "background 0.15s",
        }}
        onClick={toggleExpanded}
      >
        <span
          aria-hidden="true"
          style={{
            width: 14,
            height: 14,
            borderRadius: "9999px",
            background: color,
            border: "1px solid rgba(0,0,0,0.12)",
            flexShrink: 0,
          }}
        />
        <span style={{ flex: 1, fontSize: "var(--dg-fs-label)", fontWeight: 700, color: "var(--color-text-primary)" }}>
          {trimmedName || (
            <span style={{ color: "var(--color-text-muted)", fontStyle: "italic", fontWeight: 400 }}>
              Untitled indicator
            </span>
          )}
        </span>
        <span
          style={{
            fontSize: "var(--dg-fs-body-sm)",
            color: "var(--color-text-faint)",
            transform: expanded ? "rotate(180deg)" : "none",
            transition: "transform 150ms ease",
          }}
        >
          ▾
        </span>
      </div>

      <div
        aria-hidden={!expanded}
        style={{
          display: "grid",
          gridTemplateRows: expanded ? "1fr" : "0fr",
          transition: "grid-template-rows 220ms ease",
        }}
      >
        <div style={{ overflow: "hidden" }}>
        <div
          style={{
            background: "var(--color-bg-secondary)",
            borderRadius: "var(--dg-radius-lg)",
            border: "1px solid var(--color-border-light)",
            margin: "0 0 8px",
            padding: "14px 16px",
            display: "flex",
            flexDirection: "column",
            gap: 12,
            opacity: expanded ? 1 : 0,
            transition: "opacity 180ms ease",
            pointerEvents: expanded ? "auto" : "none",
          }}
          onClick={(event) => event.stopPropagation()}
        >
          <div>
            <label style={labelStyle}>INDICATOR NAME</label>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="dg-input"
              maxLength={50}
              placeholder="e.g. Readings"
              disabled={!canEdit}
              style={nameError || duplicateName ? { borderColor: "var(--color-danger)" } : undefined}
            />
            {nameError ? (
              <p
                role="alert"
                style={{ margin: "4px 0 0", fontSize: "var(--dg-fs-footnote)", color: "var(--color-danger)" }}
              >
                {nameError}
              </p>
            ) : duplicateName ? (
              <p
                role="alert"
                style={{ margin: "4px 0 0", fontSize: "var(--dg-fs-footnote)", color: "var(--color-danger)" }}
              >
                Another indicator already uses that name.
              </p>
            ) : null}
          </div>

          <div>
            <label style={labelStyle}>COLOR</label>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <input
                type="color"
                value={color.startsWith("#") ? color : "#2563EB"}
                onChange={(event) => setColor(event.target.value)}
                disabled={!canEdit}
                aria-label="Indicator color"
                style={{
                  width: 44,
                  height: 36,
                  padding: 4,
                  border: "1px solid var(--color-border)",
                  borderRadius: "var(--dg-btn-radius)",
                  background: "var(--color-surface)",
                  cursor: canEdit ? "pointer" : "not-allowed",
                  opacity: canEdit ? 1 : 0.55,
                }}
              />
              <span
                aria-hidden="true"
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: "9999px",
                  background: color,
                  border: "1px solid rgba(0,0,0,0.12)",
                }}
              />
              <span
                style={{
                  fontFamily:
                    "ui-monospace, SFMono-Regular, Menlo, monospace",
                  fontSize: "var(--dg-fs-caption)",
                  color: "var(--color-text-muted)",
                  textTransform: "uppercase",
                }}
              >
                {color.startsWith("#") ? color : "—"}
              </span>
            </div>
          </div>

          {canEdit && (
            <EditorActionRow
              destructiveAction={
                !indicator.isNew ? (
                  <button
                    onClick={handleDeleteClick}
                    disabled={deleting}
                    className="dg-btn dg-btn-danger dg-btn-sm"
                  >
                    {deleting ? "…" : "Delete"}
                  </button>
                ) : undefined
              }
              secondaryAction={
                <button
                  onClick={() => (indicator.isNew || !isDirty ? closeEditor() : discardDraft(false))}
                  disabled={saving || deleting}
                  className="dg-btn dg-btn-secondary dg-btn-sm"
                >
                  {getEditorDismissLabel({ hasUnsavedChanges: isDirty, isCreating: Boolean(indicator.isNew) })}
                </button>
              }
              primaryAction={
                <button
                  onClick={handleSave}
                  disabled={saving || !canSave}
                  className="dg-btn dg-btn-primary dg-btn-sm"
                >
                  {getEditorSaveLabel(saving)}
                </button>
              }
            />
          )}
        </div>
        </div>
      </div>

      {unsavedChangesDialog}
      {showDeleteConfirm && (() => {
        const hasActive = dependencyInfo?.hasDependencies ?? false;
        const hasAny = dependencyInfo?.hasAnyReferences ?? true;
        if (hasActive) {
          return (
            <ConfirmDialog
              title={`Archive "${trimmedName || "indicator"}"?`}
              message={
                <>
                  <strong>{trimmedName || "this indicator"}</strong> is currently {dependencyInfo!.summary.toLowerCase()}.
                  <br /><br />
                  Archiving will preserve those notes but remove the indicator from future use.
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
              title={`Archive "${trimmedName || "indicator"}"?`}
              message={<>This will archive <strong>{trimmedName || "this indicator"}</strong>. Historical records will be preserved.</>}
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
            title={`Delete "${trimmedName || "indicator"}"?`}
            message={<>This will permanently delete <strong>{trimmedName || "this indicator"}</strong>. Nothing references it.</>}
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
  const nextTmpId = useRef(-1);
  const clientKeyCounter = useRef(0);
  const nextClientKey = useCallback(() => `ck-${++clientKeyCounter.current}`, []);

  const [local, setLocal] = useState<LocalIndicator[]>(() =>
    indicatorTypes.map((it) => ({ ...it, clientKey: `ck-${++clientKeyCounter.current}` })),
  );

  useEffect(() => {
    setLocal((previous) => {
      const prevById = new Map(previous.map((p) => [p.id, p]));
      const hasDraft = previous.some((entry) => entry.isNew);
      const unsaved = previous.filter((entry) => entry.isNew);
      return [
        ...indicatorTypes
          // While a draft is in flight, realtime can echo the server's INSERT
          // back to us before our save's HTTP response lands. Suppress those
          // newcomers — handleSaved will install the row when the response
          // arrives, preserving the draft's clientKey so the editor closes in
          // place instead of briefly rendering a duplicate row beside it.
          .filter((it) => !hasDraft || prevById.has(it.id))
          .map((it) => ({
            ...it,
            clientKey: prevById.get(it.id)?.clientKey ?? nextClientKey(),
          })),
        ...unsaved,
      ];
    });
  }, [indicatorTypes, nextClientKey]);

  const handleAdd = useCallback(() => {
    const draft: LocalIndicator = {
      id: nextTmpId.current--,
      clientKey: nextClientKey(),
      orgId,
      name: "",
      color: "#2563EB",
      sortOrder: local.length,
      isNew: true,
    };
    setLocal((previous) => [...previous, draft]);
  }, [local.length, nextClientKey, orgId]);

  const handleSaved = useCallback(
    (saved: IndicatorType, previousId: number) => {
      // Replace the draft with the saved row while preserving the draft's
      // clientKey so the React subtree (and its open editor) keeps its identity
      // across the temp-id → real-id swap. Realtime can also land the saved
      // row in `local` before our HTTP response returns; drop that arrival in
      // favor of the draft slot so we never render two rows with the same key.
      const draft = local.find((entry) => entry.id === previousId);
      const replacement: LocalIndicator | null = draft
        ? { ...saved, clientKey: draft.clientKey }
        : null;

      const updated: LocalIndicator[] = [];
      for (const entry of local) {
        if (entry.id === previousId) {
          if (replacement) updated.push(replacement);
          continue;
        }
        if (replacement && entry.id === saved.id) continue;
        updated.push(entry);
      }
      if (!replacement && !local.some((entry) => entry.id === saved.id)) {
        updated.push({ ...saved, clientKey: nextClientKey() });
      }

      setLocal(updated);
      onChange(updated.filter((entry) => !entry.isNew));
    },
    [local, nextClientKey, onChange],
  );

  const handleDeleted = useCallback(
    (id: number) => {
      const updated = local.filter((entry) => entry.id !== id);
      setLocal(updated);
      onChange(updated.filter((entry) => !entry.isNew));
    },
    [local, onChange],
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div
        style={{
          background: "var(--color-surface)",
          borderRadius: "var(--dg-radius-md)",
          border: "1px solid var(--color-border)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: "12px 16px",
            borderBottom: "1px solid var(--color-border-light)",
            fontWeight: 700,
            fontSize: "var(--dg-fs-label)",
            color: "var(--color-text-secondary)",
          }}
        >
          Indicators
        </div>
        {local.length > 0 ? (
          <div style={{ padding: "0 16px" }}>
            {local.map((indicator, indicatorIndex) => (
              <IndicatorRow
                key={indicator.clientKey}
                indicator={indicator}
                orgId={orgId}
                allIndicators={local}
                canEdit={canManageIndicatorTypes}
                onSaved={handleSaved}
                onDeleted={handleDeleted}
                isLast={indicatorIndex === local.length - 1}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            size="compact"
            title="No indicators yet"
            description="Indicators flag readings, conflicts, or notes on shift cells."
            action={
              canManageIndicatorTypes ? (
                <button onClick={handleAdd} className="dg-btn dg-btn-secondary dg-btn-sm">
                  + Add Indicator
                </button>
              ) : undefined
            }
            style={{ margin: "12px 16px" }}
          />
        )}
        {local.length > 0 && canManageIndicatorTypes && (
          <div style={{ padding: "8px 16px 12px" }}>
            <button
              onClick={handleAdd}
              className="dg-btn dg-btn-dashed dg-btn-sm"
              style={{ width: "100%" }}
            >
              + Add Indicator
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
