"use client";

import React, { useEffect, useRef, useState } from "react";
import { IndicatorType } from "@/types";
import { upsertIndicatorType, deleteIndicatorType } from "@/lib/db";
import { toast } from "sonner";
import * as Sentry from "@/lib/sentry";
import ConfirmDialog from "@/components/ConfirmDialog";
import { useMediaQuery, MOBILE } from "@/hooks";
import { inputStyle } from "./shared";
import { EmptyState } from "@/components/EmptyState";

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
  const [local, setLocal] = useState<(IndicatorType & { isNew?: boolean })[]>(indicatorTypes);
  const [saving, setSaving] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const nextTmpId = useRef(-1);
  const originalRef = useRef<Map<number, IndicatorType>>(
    new Map(indicatorTypes.map((indicator) => [indicator.id, indicator])),
  );

  useEffect(() => {
    originalRef.current = new Map(indicatorTypes.map((indicator) => [indicator.id, indicator]));
  }, [indicatorTypes]);

  const handleAdd = () => {
    const tmp: IndicatorType & { isNew: boolean } = {
      id: nextTmpId.current--,
      orgId: orgId,
      name: "",
      color: "var(--color-brand)",
      sortOrder: local.length,
      isNew: true,
    };
    setLocal((prev) => [...prev, tmp]);
  };

  const handleSave = async (indicator: IndicatorType & { isNew?: boolean }) => {
    if (!indicator.name.trim()) return;
    setSaving(indicator.id);
    try {
      const saved = await upsertIndicatorType({
        id: indicator.isNew ? undefined : indicator.id,
        orgId: orgId,
        name: indicator.name.trim(),
        color: indicator.color,
        sortOrder: indicator.sortOrder,
      });
      originalRef.current.set(saved.id, saved);
      const updated = local.map((i) => (i.id === indicator.id ? saved : i));
      setLocal(updated);
      onChange(updated);
      toast.success("Indicator saved");
    } catch (err) {
      toast.error("Failed to save indicator");
      Sentry.captureException(err);
    } finally {
      setSaving(null);
    }
  };

  const handleDelete = async (indicator: IndicatorType & { isNew?: boolean }) => {
    if (indicator.isNew) {
      const updated = local.filter((i) => i.id !== indicator.id);
      setLocal(updated);
      onChange(updated);
      return;
    }
    setDeleting(indicator.id);
    try {
      await deleteIndicatorType(indicator.id, orgId);
      const updated = local.filter((i) => i.id !== indicator.id);
      setLocal(updated);
      onChange(updated);
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
    setLocal((prev) => prev.map((i) => (i.id === id ? { ...i, [field]: value } : i)));
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
        const isSavingThis = saving === indicator.id;
        const isDeletingThis = deleting === indicator.id;
        const original = originalRef.current.get(indicator.id);
        const isDirty =
          indicator.isNew ||
          !original ||
          indicator.name.trim() !== original.name ||
          indicator.color !== original.color;
        return (
          <div
            key={indicator.id}
            style={{
              display: isMobile ? "flex" : "grid",
              flexWrap: isMobile ? "wrap" as const : undefined,
              gridTemplateColumns: isMobile ? undefined : "1fr 80px auto auto",
              gap: 10,
              alignItems: "center",
              padding: "10px 0",
              borderBottom: "1px solid var(--color-border-light)",
            }}
          >
            <input
              value={indicator.name}
              onChange={(e) => handleChange(indicator.id, "name", e.target.value)}
              placeholder="Indicator name (e.g. Readings)"
              maxLength={50}
              style={{ ...inputStyle, ...(isMobile ? { width: "100%" } : {}) }}
            />
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <input
                type="color"
                value={indicator.color}
                onChange={(e) => handleChange(indicator.id, "color", e.target.value)}
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
            {canManageIndicatorTypes && (
              <button
                onClick={() => handleSave(indicator)}
                disabled={isSavingThis || !indicator.name.trim() || !isDirty}
                className="dg-btn dg-btn-primary dg-btn-sm"
              >
                {isSavingThis ? "…" : "Save"}
              </button>
            )}
            {canManageIndicatorTypes && (
              <button
                onClick={() => indicator.isNew ? handleDelete(indicator) : setConfirmDeleteId(indicator.id)}
                disabled={isDeletingThis}
                className="dg-btn dg-btn-danger dg-btn-sm"
              >
                {isDeletingThis ? "…" : "Delete"}
              </button>
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
      {confirmDeleteId !== null && (() => {
        const indicator = local.find(i => i.id === confirmDeleteId);
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
