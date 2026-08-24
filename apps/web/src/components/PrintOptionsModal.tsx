"use client";

import { useState } from "react";
import { Printer } from "lucide-react";
import { FocusArea } from "@/types";
import { Button } from "@/components/Button";
import { CloseButton } from "@/components/ui/CloseButton";
import { EDITOR_ACTION_LABELS } from "@/components/ui/editor-action-labels";
import { useUnsavedChangesPrompt } from "@/components/ui/use-unsaved-changes-prompt";

export interface PrintConfig {
  fontSize: number;
  selectedFocusAreas: string[];
  spanWeeks: 1 | 2 | "month";
}

interface PrintOptionsModalProps {
  focusAreas: FocusArea[];
  currentSpanWeeks: 1 | 2 | "month";
  onPrint: (config: PrintConfig) => void;
  onClose: () => void;
  focusAreaLabel?: string;
}

const FONT_SIZES = [
  { key: "small", label: "Small", value: 7 },
  { key: "medium", label: "Medium", value: 9 },
  { key: "large", label: "Large", value: 11 },
] as const;

type FontSizeKey = (typeof FONT_SIZES)[number]["key"];

export default function PrintOptionsModal({
  focusAreas,
  currentSpanWeeks,
  onPrint,
  onClose,
  focusAreaLabel = "Focus Areas",
}: PrintOptionsModalProps) {
  const [selectedFocusAreas, setSelectedFocusAreas] = useState<string[]>(
    focusAreas.map((w) => w.name),
  );
  const [spanWeeks, setSpanWeeks] = useState<1 | 2 | "month">(currentSpanWeeks);
  const [fontSizeKey, setFontSizeKey] = useState<FontSizeKey>("medium");

  const allSelected = selectedFocusAreas.length === focusAreas.length;
  const hasUnsavedChanges =
    spanWeeks !== currentSpanWeeks ||
    fontSizeKey !== "medium" ||
    JSON.stringify([...selectedFocusAreas].sort()) !==
      JSON.stringify([...focusAreas.map((focusArea) => focusArea.name)].sort());
  const { requestClose, unsavedChangesDialog } = useUnsavedChangesPrompt({
    hasUnsavedChanges,
    onDiscard: onClose,
  });

  function handleRequestClose() {
    if (requestClose()) {
      onClose();
    }
  }

  function toggleFocusArea(name: string) {
    setSelectedFocusAreas((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name],
    );
  }

  function toggleAll() {
    setSelectedFocusAreas(focusAreas.map((w) => w.name));
  }

  function handlePrint() {
    const fontSize = FONT_SIZES.find((f) => f.key === fontSizeKey)!.value;
    onPrint({ fontSize, selectedFocusAreas, spanWeeks });
  }

  return (
    <>
      <div
        className="dg-modal-overlay"
        onClick={(e) => e.target === e.currentTarget && handleRequestClose()}
      >
        <div className="dg-modal" style={{ maxWidth: 400 }}>
          {/* Header */}
          <div className="dg-modal-header">
            <div className="dg-modal-title">Print / Export Options</div>
            <CloseButton size="md" onClick={handleRequestClose} aria-label="Close print options" />
          </div>

          {/* View */}
          <div className="dg-modal-section">
            <div className="dg-modal-section-label">VIEW</div>
            <div className="dg-span-tabs dg-span-tabs--light" style={{ display: "inline-flex" }}>
              {([1, 2, "month"] as const).map((n) => (
                <Button
                  key={n}
                  onClick={() => setSpanWeeks(n)}
                  className={`dg-span-tab${spanWeeks === n ? " active" : ""}`}
                  style={{ minWidth: 72 }}
                >
                  {n === "month" ? "Month" : n === 1 ? "1 Week" : "2 Weeks"}
                </Button>
              ))}
            </div>
          </div>

          {/* Font Size */}
          <div className="dg-modal-section">
            <div className="dg-modal-section-label">FONT SIZE</div>
            <div className="dg-span-tabs dg-span-tabs--light" style={{ display: "inline-flex" }}>
              {FONT_SIZES.map((f) => (
                <Button
                  key={f.key}
                  onClick={() => setFontSizeKey(f.key)}
                  className={`dg-span-tab${fontSizeKey === f.key ? " active" : ""}`}
                  style={{ minWidth: 72 }}
                >
                  {f.label}
                </Button>
              ))}
            </div>
          </div>

          {/* Focus Areas */}
          {focusAreas.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <div className="dg-modal-section-label">{focusAreaLabel.toUpperCase()}</div>
              <div className="dg-checklist">
                {/* All toggle */}
                <label className="dg-checkbox-row dg-checkbox-row--header">
                  <input
                    type="checkbox"
                    className="dg-checkbox"
                    checked={allSelected}
                    onChange={toggleAll}
                  />
                  All {focusAreaLabel}
                </label>
                {/* Individual focus areas */}
                {focusAreas.map((w) => (
                  <label key={w.name} className="dg-checkbox-row">
                    <input
                      type="checkbox"
                      className="dg-checkbox"
                      checked={selectedFocusAreas.includes(w.name)}
                      onChange={() => toggleFocusArea(w.name)}
                    />
                    {w.name}
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="dg-modal-actions">
            <Button onClick={handleRequestClose} className="dg-btn dg-btn-secondary">
              {EDITOR_ACTION_LABELS.close}
            </Button>
            <Button
              onClick={handlePrint}
              disabled={focusAreas.length > 0 && selectedFocusAreas.length === 0}
              className="dg-btn dg-btn-primary"
              style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
            >
              <Printer size={13} />
              Preview & Print
            </Button>
          </div>
        </div>
      </div>
      {unsavedChangesDialog}
    </>
  );
}
