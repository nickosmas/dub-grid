"use client";

import { Check } from "lucide-react";

export interface StepperStep {
  id: string;
  label: string;
}

interface StepperBarProps {
  steps: StepperStep[];
  currentStepIndex: number;
}

export default function StepperBar({ steps, currentStepIndex }: StepperBarProps) {
  return (
    <div
      style={{ display: "flex", alignItems: "center", gap: 0, width: "100%" }}
      role="progressbar"
      aria-valuenow={currentStepIndex + 1}
      aria-valuemin={1}
      aria-valuemax={steps.length}
      aria-label={`Step ${currentStepIndex + 1} of ${steps.length}: ${steps[currentStepIndex]?.label ?? ""}`}
    >
      {steps.map((step, i) => {
        const isCompleted = i < currentStepIndex;
        const isCurrent = i === currentStepIndex;

        return (
          <div
            key={step.id}
            style={{
              display: "flex",
              alignItems: "center",
              flex: i < steps.length - 1 ? 1 : "0 0 auto",
            }}
          >
            {/* Step indicator */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 6,
                flexShrink: 0,
              }}
            >
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 13,
                  fontWeight: 700,
                  transition: "all 200ms ease",
                  ...(isCompleted
                    ? {
                        background: "var(--color-brand)",
                        color: "white",
                        border: "2px solid var(--color-brand)",
                      }
                    : isCurrent
                      ? {
                          background: "white",
                          color: "var(--color-brand)",
                          border: "2px solid var(--color-brand)",
                          boxShadow: "0 0 0 3px rgba(59, 130, 246, 0.15)",
                        }
                      : {
                          background: "var(--color-bg-secondary)",
                          color: "var(--color-text-faint)",
                          border: "2px solid var(--color-border)",
                        }),
                }}
              >
                {isCompleted ? <Check size={16} strokeWidth={3} /> : i + 1}
              </div>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: isCurrent ? 700 : 500,
                  color: isCurrent
                    ? "var(--color-text-primary)"
                    : isCompleted
                      ? "var(--color-brand)"
                      : "var(--color-text-faint)",
                  whiteSpace: "nowrap",
                  maxWidth: 80,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  textAlign: "center",
                }}
              >
                {step.label}
              </span>
            </div>

            {/* Connector line */}
            {i < steps.length - 1 && (
              <div
                style={{
                  flex: 1,
                  height: 2,
                  marginBottom: 22,
                  marginLeft: 8,
                  marginRight: 8,
                  borderRadius: 1,
                  background: isCompleted ? "var(--color-brand)" : "var(--color-border)",
                  transition: "background 200ms ease",
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
