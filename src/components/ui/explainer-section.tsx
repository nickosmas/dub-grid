"use client";

import React, { useEffect, useId, useState } from "react";

export interface ExplainerPoint {
  title: string;
  description: React.ReactNode;
}

export interface ExplainerSectionProps {
  title: string;
  points: ExplainerPoint[];
  preview?: React.ReactNode;
  defaultOpen?: boolean;
  compact?: boolean;
  storageKey?: string;
}

interface PreviewFrameProps {
  title: string;
  subtitle?: string;
  badge?: React.ReactNode;
  compact?: boolean;
  children: React.ReactNode;
}

interface WorkflowStep {
  label: string;
  description?: string;
  tone?: "default" | "info" | "success" | "warning";
}

interface WorkflowStripProps {
  steps: WorkflowStep[];
  compact?: boolean;
}

const WORKFLOW_TONES: Record<NonNullable<WorkflowStep["tone"]>, { bg: string; border: string; text: string }> = {
  default: {
    bg: "var(--color-bg)",
    border: "var(--color-border-light)",
    text: "var(--color-text-secondary)",
  },
  info: {
    bg: "var(--color-info-bg)",
    border: "var(--color-info-border)",
    text: "var(--color-info-text)",
  },
  success: {
    bg: "var(--color-success-bg)",
    border: "var(--color-success-border)",
    text: "var(--color-success-text)",
  },
  warning: {
    bg: "var(--color-warning-bg)",
    border: "var(--color-warning-border)",
    text: "var(--color-warning-text)",
  },
};

export function PreviewFrame({
  title,
  subtitle,
  badge,
  compact = false,
  children,
}: PreviewFrameProps) {
  const padding = compact ? 10 : 12;

  return (
    <div
      style={{
        flex: "1 1 260px",
        minWidth: compact ? 220 : 240,
        borderRadius: "var(--dg-radius-md)",
        overflow: "hidden",
        border: "1px solid var(--color-border)",
        background: "var(--color-surface)",
        boxShadow: "0 8px 20px rgba(15, 23, 42, 0.08)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          padding: `${compact ? 8 : 10}px ${padding}px`,
          background: "var(--color-bg)",
          borderBottom: "1px solid var(--color-border-light)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
            <div
              style={{
                fontSize: compact ? 11 : "var(--dg-fs-footnote)",
                fontWeight: 700,
                color: "var(--color-text-secondary)",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {title}
            </div>
            {subtitle ? (
              <div
                style={{
                  fontSize: 11,
                  color: "var(--color-text-muted)",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {subtitle}
              </div>
            ) : null}
          </div>
        </div>
        {badge}
      </div>

      <div style={{ padding, display: "flex", flexDirection: "column", gap: compact ? 8 : 10 }}>
        {children}
      </div>
    </div>
  );
}

export function WorkflowStrip({ steps, compact = false }: WorkflowStripProps) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "stretch",
        gap: compact ? 6 : 8,
        flexWrap: "wrap",
      }}
    >
      {steps.map((step, index) => {
        const tone = WORKFLOW_TONES[step.tone ?? "default"];
        const isLast = index === steps.length - 1;

        return (
          <React.Fragment key={`${step.label}-${index}`}>
            <div
              style={{
                flex: compact ? "1 1 150px" : "1 1 170px",
                minWidth: compact ? 140 : 150,
                padding: compact ? "8px 10px" : "10px 12px",
                borderRadius: "var(--dg-radius-sm)",
                background: tone.bg,
                border: `1px solid ${tone.border}`,
                display: "flex",
                flexDirection: "column",
                gap: 4,
              }}
            >
              <div style={{ fontSize: compact ? 11 : "var(--dg-fs-footnote)", fontWeight: 700, color: tone.text }}>
                {step.label}
              </div>
              {step.description ? (
                <div style={{ fontSize: compact ? 11 : "var(--dg-fs-caption)", color: tone.text, lineHeight: 1.45 }}>
                  {step.description}
                </div>
              ) : null}
            </div>
            {!isLast ? (
              <div
                aria-hidden="true"
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "var(--color-text-faint)",
                  minWidth: compact ? 14 : 18,
                  fontSize: compact ? 12 : 14,
                  fontWeight: 700,
                }}
              >
                &rarr;
              </div>
            ) : null}
          </React.Fragment>
        );
      })}
    </div>
  );
}

export function ExplainerSection({
  title,
  points,
  preview,
  defaultOpen = true,
  compact = false,
  storageKey,
}: ExplainerSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [hasLoadedPreference, setHasLoadedPreference] = useState(!storageKey);
  const contentId = `explainer-${useId().replace(/:/g, "")}`;

  useEffect(() => {
    if (!storageKey || typeof window === "undefined") {
      setHasLoadedPreference(true);
      return;
    }

    try {
      const storedValue = window.localStorage.getItem(storageKey);
      if (storedValue === "open") setIsOpen(true);
      if (storedValue === "closed") setIsOpen(false);
    } catch {
      // Ignore unavailable storage and fall back to the default state.
    }
    setHasLoadedPreference(true);
  }, [storageKey]);

  useEffect(() => {
    if (!storageKey || !hasLoadedPreference || typeof window === "undefined") return;

    try {
      window.localStorage.setItem(storageKey, isOpen ? "open" : "closed");
    } catch {
      // Ignore storage write failures.
    }
  }, [hasLoadedPreference, isOpen, storageKey]);

  const padding = compact ? "10px 12px" : "12px 14px";
  const iconSize = compact ? 24 : 28;
  const pointSize = compact ? 22 : 24;

  return (
    <div
      style={{
        padding,
        borderRadius: "var(--dg-radius-md)",
        border: "1px solid var(--color-info-border)",
        background: "var(--color-info-bg)",
        display: "flex",
        flexDirection: "column",
        gap: compact ? 8 : 10,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          <div
            style={{
              width: iconSize,
              height: iconSize,
              borderRadius: "50%",
              background: "rgba(255,255,255,0.7)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--color-info-text)",
              flexShrink: 0,
            }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 16v-4" />
              <path d="M12 8h.01" />
            </svg>
          </div>
          <div
            style={{
              fontSize: compact ? "var(--dg-fs-caption)" : "var(--dg-fs-footnote)",
              fontWeight: 700,
              color: "var(--color-info-text)",
              minWidth: 0,
            }}
          >
            {title}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setIsOpen((current) => !current)}
          className="dg-btn dg-btn-secondary dg-btn-sm"
          aria-expanded={isOpen}
          aria-controls={contentId}
          style={{
            background: "rgba(255,255,255,0.7)",
            borderColor: "var(--color-info-border)",
            color: "var(--color-info-text)",
            flexShrink: 0,
          }}
        >
          {isOpen ? "Hide" : "Show"}
        </button>
      </div>

      {isOpen ? (
        <div id={contentId} style={{ display: "flex", flexDirection: "column", gap: compact ? 10 : 12 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: compact ? 6 : 8 }}>
            {points.map((point, index) => (
              <div
                key={point.title}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: compact ? 8 : 10,
                  padding: compact ? "8px 10px" : "10px 12px",
                  borderRadius: "var(--dg-radius-sm)",
                  background: "rgba(255,255,255,0.7)",
                  border: "1px solid rgba(255,255,255,0.75)",
                }}
              >
                <div
                  style={{
                    width: pointSize,
                    height: pointSize,
                    borderRadius: "50%",
                    background: "var(--color-info-text)",
                    color: "#fff",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: compact ? 10 : 11,
                    fontWeight: 700,
                    flexShrink: 0,
                    marginTop: 1,
                  }}
                >
                  {index + 1}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <div style={{ fontSize: compact ? 11 : "var(--dg-fs-footnote)", fontWeight: 700, color: "var(--color-info-text)" }}>
                    {point.title}
                  </div>
                  <div style={{ fontSize: compact ? 11 : "var(--dg-fs-caption)", color: "var(--color-info-text)", lineHeight: 1.55 }}>
                    {point.description}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {preview ? (
            <div style={{ display: "flex", flexDirection: "column", gap: compact ? 6 : 8 }}>
              <div style={{ fontSize: compact ? 11 : "var(--dg-fs-footnote)", fontWeight: 700, color: "var(--color-info-text)" }}>
                Visual examples
              </div>
              {preview}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
