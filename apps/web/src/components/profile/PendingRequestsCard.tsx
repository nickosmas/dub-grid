"use client";

import { X } from "lucide-react";
import type { ProfileChangeRequest } from "@/features/account/client";

interface PendingRequestsCardProps {
  requests: ProfileChangeRequest[];
  cancellingId: string | null;
  onCancel: (request: ProfileChangeRequest) => void;
}

const TYPE_LABELS: Record<ProfileChangeRequest["type"], string> = {
  profile_update: "Name change",
  account_deletion: "Account deletion",
};

const TYPE_DESCRIPTIONS: Record<ProfileChangeRequest["type"], string> = {
  profile_update:
    "An admin will review and update your name once approved.",
  account_deletion:
    "An admin will review and remove your account once approved.",
};

function formatSubmittedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function PendingRequestsCard({
  requests,
  cancellingId,
  onCancel,
}: PendingRequestsCardProps) {
  if (requests.length === 0) return null;

  const countLabel =
    requests.length === 1 ? "1 pending request" : `${requests.length} pending requests`;

  return (
    <div
      className="dg-card"
      style={{
        borderColor: "var(--color-warning-border)",
        background: "var(--color-warning-bg)",
      }}
    >
      <div
        className="dg-card-header"
        style={{ borderBottomColor: "var(--color-warning-border)" }}
      >
        <div className="flex items-start gap-2">
          <svg
            aria-hidden="true"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="currentColor"
            style={{ color: "var(--color-warning-text)", marginTop: 2, flexShrink: 0 }}
          >
            <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm4.5 11h-5a1 1 0 0 1-1-1V6a1 1 0 0 1 2 0v5h4a1 1 0 0 1 0 2z" />
          </svg>
          <div>
            <div
              className="dg-card-title"
              style={{ color: "var(--color-warning-text)" }}
            >
              {countLabel}
            </div>
            <div className="dg-card-subtitle">
              Waiting on admin review. You can cancel a request anytime.
            </div>
          </div>
        </div>
      </div>
      <div className="dg-card-body flex flex-col gap-3">
        {requests.map((request) => {
          const isCancelling = cancellingId === request.id;
          return (
            <div
              key={request.id}
              className="flex flex-col gap-2 rounded-[var(--dg-radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] p-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex flex-col gap-1">
                <span className="text-[14px] font-semibold text-[var(--color-text-primary)]">
                  {TYPE_LABELS[request.type]}
                </span>
                <span className="text-[13px] text-[var(--color-text-muted)]">
                  {TYPE_DESCRIPTIONS[request.type]}
                </span>
                <span className="text-[12px] text-[var(--color-text-subtle)]">
                  Submitted {formatSubmittedAt(request.createdAt)}
                </span>
              </div>
              <button
                type="button"
                onClick={() => onCancel(request)}
                disabled={isCancelling}
                className="dg-btn dg-btn-secondary dg-btn-sm self-start sm:self-auto"
              >
                <X size={14} style={{ marginRight: 4 }} />
                {isCancelling ? "Cancelling..." : "Cancel request"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
