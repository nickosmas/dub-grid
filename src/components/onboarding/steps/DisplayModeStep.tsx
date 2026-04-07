"use client";

import { useState, useCallback } from "react";
import StepLayout from "../StepLayout";
import { DisplayModeSample, DISPLAY_MODES } from "@/components/settings/DisplayMode";
import { useOrganizationData } from "@/hooks";
import { updateOrganization } from "@/lib/db";
import { toast } from "sonner";
import * as Sentry from "@/lib/sentry";
import type { ShiftDisplayMode } from "@/types";

interface DisplayModeStepProps {
  onNext: () => void;
  onBack: () => void;
}

export default function DisplayModeStep({ onNext, onBack }: DisplayModeStepProps) {
  const { org, shiftCodes, setOrg } = useOrganizationData();
  const [selected, setSelected] = useState<ShiftDisplayMode>(
    org?.shiftDisplayMode ?? "code",
  );
  const [saving, setSaving] = useState(false);

  const handleNext = useCallback(async () => {
    if (!org) return;
    if (selected === org.shiftDisplayMode) {
      onNext();
      return;
    }
    setSaving(true);
    try {
      const updated = { ...org, shiftDisplayMode: selected };
      await updateOrganization(updated);
      setOrg(updated);
      onNext();
    } catch (err) {
      Sentry.captureException(err);
      toast.error("Failed to save display mode");
    } finally {
      setSaving(false);
    }
  }, [org, selected, setOrg, onNext]);

  if (!org) return null;

  return (
    <StepLayout
      title="Display Mode"
      description="Choose how shifts appear on the schedule grid. This affects how shift codes are displayed throughout the app."
      onNext={handleNext}
      onBack={onBack}
      nextDisabled={saving}
    >
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {DISPLAY_MODES.map((mode) => {
          const isActive = selected === mode.id;
          return (
            <button
              key={mode.id}
              type="button"
              onClick={() => setSelected(mode.id)}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 12,
                padding: 16,
                borderRadius: 12,
                border: isActive
                  ? "2px solid var(--color-brand)"
                  : "1px solid var(--color-border)",
                background: isActive
                  ? "var(--color-brand-bg, rgba(59,130,246,0.06))"
                  : "var(--color-surface)",
                cursor: "pointer",
                textAlign: "left",
                transition: "border-color 150ms ease, background 150ms ease",
              }}
            >
              {/* Radio indicator + title */}
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: "50%",
                    border: isActive
                      ? "2px solid var(--color-brand)"
                      : "2px solid var(--color-border-strong, #94a3b8)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  {isActive && (
                    <div
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: "50%",
                        background: "var(--color-brand)",
                      }}
                    />
                  )}
                </div>
                <span
                  style={{
                    fontWeight: 700,
                    fontSize: 15,
                    color: "var(--color-text-primary)",
                  }}
                >
                  {mode.title}
                </span>
              </div>

              {/* Description */}
              <p
                style={{
                  fontSize: 13,
                  color: "var(--color-text-muted)",
                  lineHeight: 1.5,
                  margin: 0,
                }}
              >
                {mode.description}
              </p>

              {/* Sample grid */}
              <DisplayModeSample mode={mode.id} shiftCodes={shiftCodes} />
            </button>
          );
        })}
      </div>
    </StepLayout>
  );
}
