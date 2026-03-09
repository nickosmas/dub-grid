"use client";

import { useState } from "react";
import { Wing } from "@/types";

export interface PrintConfig {
  fontSize: number;
  selectedWings: string[]; // empty = all wings
  spanWeeks: 1 | 2 | "month";
}

interface PrintOptionsModalProps {
  wings: Wing[];
  currentSpanWeeks: 1 | 2 | "month";
  onPrint: (config: PrintConfig) => void;
  onClose: () => void;
}

const FONT_SIZES = [
  { label: "Small", value: 8 },
  { label: "Medium", value: 10 },
  { label: "Large", value: 12 },
];

export default function PrintOptionsModal({
  wings,
  currentSpanWeeks,
  onPrint,
  onClose,
}: PrintOptionsModalProps) {
  const [fontSize, setFontSize] = useState(10);
  const [selectedWings, setSelectedWings] = useState<string[]>(
    wings.map((w) => w.name),
  );
  const [spanWeeks, setSpanWeeks] = useState<1 | 2 | "month">(
    currentSpanWeeks,
  );

  const allSelected = selectedWings.length === wings.length;

  function toggleWing(name: string) {
    setSelectedWings((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name],
    );
  }

  function toggleAll() {
    setSelectedWings(allSelected ? [] : wings.map((w) => w.name));
  }

  function handlePrint() {
    onPrint({ fontSize, selectedWings, spanWeeks });
  }

  return (
    <div
      className="dg-modal-overlay"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="dg-modal" style={{ maxWidth: 400 }}>
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 24,
          }}
        >
          <div
            style={{
              fontSize: 17,
              fontWeight: 700,
              color: "var(--color-text-primary)",
            }}
          >
            Print / Export Options
          </div>
          <button
            onClick={onClose}
            className="dg-btn dg-btn-ghost"
            style={{ padding: "4px 8px", fontSize: 18, lineHeight: 1 }}
          >
            ×
          </button>
        </div>

        {/* View */}
        <div style={{ marginBottom: 20 }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: "var(--color-text-subtle)",
              letterSpacing: "0.07em",
              marginBottom: 8,
            }}
          >
            VIEW
          </div>
          <div className="dg-segment" style={{ display: "inline-flex" }}>
            {([1, 2, "month"] as const).map((n) => (
              <button
                key={n}
                onClick={() => setSpanWeeks(n)}
                className={`dg-segment-btn${spanWeeks === n ? " active" : ""}`}
                style={{ minWidth: 72 }}
              >
                {n === "month" ? "Month" : n === 1 ? "1 Week" : "2 Weeks"}
              </button>
            ))}
          </div>
          {spanWeeks === "month" && (
            <div
              style={{
                fontSize: 11,
                color: "var(--color-text-muted)",
                marginTop: 6,
              }}
            >
              Tip: use Small font for month view
            </div>
          )}
        </div>

        {/* Font Size */}
        <div style={{ marginBottom: 20 }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: "var(--color-text-subtle)",
              letterSpacing: "0.07em",
              marginBottom: 8,
            }}
          >
            FONT SIZE
          </div>
          <div className="dg-segment" style={{ display: "inline-flex" }}>
            {FONT_SIZES.map(({ label, value }) => (
              <button
                key={value}
                onClick={() => setFontSize(value)}
                className={`dg-segment-btn${fontSize === value ? " active" : ""}`}
                style={{ minWidth: 72 }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Wings */}
        {wings.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: "var(--color-text-subtle)",
                letterSpacing: "0.07em",
                marginBottom: 8,
              }}
            >
              WINGS
            </div>
            <div
              style={{
                border: "1px solid var(--color-border)",
                borderRadius: 10,
                overflow: "hidden",
              }}
            >
              {/* All toggle */}
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "9px 14px",
                  cursor: "pointer",
                  background: "var(--color-surface-overlay)",
                  borderBottom: "1px solid var(--color-border)",
                  fontSize: 13,
                  fontWeight: 600,
                  color: "var(--color-text-secondary)",
                }}
              >
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  style={{ accentColor: "#0F172A", width: 14, height: 14 }}
                />
                All Wings
              </label>
              {/* Individual wings */}
              {wings.map((w, i) => (
                <label
                  key={w.name}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "9px 14px",
                    cursor: "pointer",
                    borderBottom:
                      i < wings.length - 1
                        ? "1px solid var(--color-border-light)"
                        : "none",
                    fontSize: 13,
                    color: "var(--color-text-secondary)",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={selectedWings.includes(w.name)}
                    onChange={() => toggleWing(w.name)}
                    style={{ accentColor: "#0F172A", width: 14, height: 14 }}
                  />
                  {w.name}
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        <div
          style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}
        >
          <button onClick={onClose} className="dg-btn dg-btn-secondary">
            Cancel
          </button>
          <button
            onClick={handlePrint}
            disabled={selectedWings.length === 0}
            className="dg-btn dg-btn-primary"
          >
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ marginRight: 4 }}
            >
              <polyline points="6 9 6 2 18 2 18 9" />
              <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
              <rect x="6" y="14" width="12" height="8" />
            </svg>
            Preview & Print
          </button>
        </div>
      </div>
    </div>
  );
}
