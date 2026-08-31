"use client";

import { Button } from "@/components/Button";

interface AccessStatusRowProps {
  label: string;
  statusText: string;
  tone?: "active" | "neutral";
  note?: string;
  actionLabel?: string;
  onAction?: () => void;
  disabled?: boolean;
}

/**
 * A compact "you currently have X access" row with an optional remove
 * action, shared by EditEmployeePanel (schedule access) and
 * EmployeeManagementAccessEditor (management access) so both read as one
 * consistent access language at the top of each editor.
 */
export function AccessStatusRow({
  label,
  statusText,
  tone = "active",
  note,
  actionLabel,
  onAction,
  disabled,
}: AccessStatusRowProps) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-[var(--dg-radius-md)] border border-[var(--dg-color-border-light)] bg-[var(--dg-color-bg-secondary)] px-4 py-3">
      <div className="min-w-0">
        <div className="text-[11px] font-semibold uppercase tracking-[0.05em] text-[var(--dg-color-text-subtle)]">
          {label}
        </div>
        <div
          className={`mt-0.5 text-[13px] font-medium ${
            tone === "active"
              ? "text-[var(--dg-color-text-primary)]"
              : "text-[var(--dg-color-text-muted)]"
          }`}
        >
          {statusText}
        </div>
        {note && <div className="mt-1 text-[12px] text-[var(--dg-color-text-muted)]">{note}</div>}
      </div>
      {actionLabel && onAction && (
        <Button
          type="button"
          onClick={onAction}
          disabled={disabled}
          className="dg-btn dg-btn-ghost dg-btn-sm shrink-0"
          style={{ color: "var(--dg-color-danger)" }}
        >
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
