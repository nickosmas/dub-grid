"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { ButtonLoading } from "@/components/ButtonSpinner";
import { Button } from "@/components/Button";

interface StepLayoutProps {
  title: string;
  description?: string;
  children: React.ReactNode;
  onNext?: () => void;
  onBack?: () => void;
  nextLabel?: string;
  /** What Next says while the step saves, beside its spinner. */
  nextPendingLabel?: string;
  backLabel?: string;
  nextDisabled?: boolean;
  nextLoading?: boolean;
  showBack?: boolean;
  /** Wider layout for steps with settings components */
  wide?: boolean;
}

export default function StepLayout({
  title,
  description,
  children,
  onNext,
  onBack,
  nextLabel = "Continue",
  nextPendingLabel = "Saving",
  backLabel = "Back",
  nextDisabled = false,
  nextLoading = false,
  showBack = true,
  wide = false,
}: StepLayoutProps) {
  return (
    <div
      style={{
        width: "100%",
        maxWidth: wide ? 720 : 560,
        margin: "0 auto",
      }}
    >
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h2
          style={{
            fontSize: 24,
            fontWeight: 800,
            color: "var(--color-text-primary)",
            margin: "0 0 8px",
            letterSpacing: "-0.02em",
          }}
        >
          {title}
        </h2>
        {description && (
          <p
            style={{
              fontSize: 15,
              color: "var(--color-text-muted)",
              margin: 0,
              lineHeight: 1.6,
            }}
          >
            {description}
          </p>
        )}
      </div>

      {/* Content */}
      <div style={{ marginBottom: 32 }}>{children}</div>

      {/* Navigation */}
      <div
        style={{
          display: "flex",
          justifyContent: showBack && onBack ? "space-between" : "flex-end",
          alignItems: "center",
          gap: 12,
        }}
      >
        {showBack && onBack && (
          <Button
            onClick={onBack}
            type="button"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "10px 20px",
              borderRadius: 10,
              border: "1px solid var(--color-border)",
              background: "var(--color-surface)",
              color: "var(--color-text-secondary)",
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
              transition: "background 150ms ease",
            }}
          >
            <ChevronLeft size={16} />
            {backLabel}
          </Button>
        )}
        {onNext && (
          <Button
            onClick={onNext}
            disabled={nextDisabled || nextLoading}
            type="button"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "10px 24px",
              borderRadius: 10,
              border: "none",
              background: nextDisabled ? "var(--color-bg-secondary)" : "var(--color-brand)",
              color: nextDisabled ? "var(--color-text-faint)" : "var(--color-text-inverse)",
              fontSize: 14,
              fontWeight: 700,
              cursor: nextDisabled ? "not-allowed" : "pointer",
              transition: "background 150ms ease, transform 150ms ease",
              boxShadow: nextDisabled ? "none" : "0 2px 8px rgba(37, 99, 235, 0.2)",
            }}
          >
            <ButtonLoading
              loading={nextLoading}
              loadingLabel={nextPendingLabel}
              spinnerColor="var(--color-text-inverse)"
              spinnerSize={18}
            >
              {nextLabel}
              <ChevronRight size={16} />
            </ButtonLoading>
          </Button>
        )}
      </div>
    </div>
  );
}
