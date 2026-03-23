"use client";

import { useState } from "react";
import type { ShiftRequest, ShiftRequestStatus } from "@/types";
import { useMediaQuery, MOBILE } from "@/hooks";

// ── Types ────────────────────────────────────────────────────────────────────

interface ShiftRequestBoardProps {
  openPickups: ShiftRequest[];
  myRequests: ShiftRequest[];
  pendingApproval: ShiftRequest[];
  loading: boolean;
  currentEmpId: string | null;
  canApprove: boolean;
  onClaim: (requestId: string) => void;
  onRespond: (requestId: string, accept: boolean) => void;
  onResolve: (requestId: string, approved: boolean, note?: string) => void;
  onCancel: (requestId: string) => void;
  onClose: () => void;
}

type Tab = "available" | "mine" | "approval";

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatShiftDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function hoursRemaining(expiresAt: string): number {
  return Math.max(0, Math.round((new Date(expiresAt).getTime() - Date.now()) / 3600000));
}

function timeRemainingLabel(expiresAt: string): string {
  const hours = hoursRemaining(expiresAt);
  if (hours <= 0) return "Expired";
  if (hours < 24) return `${hours}h left`;
  const days = Math.floor(hours / 24);
  return `${days}d left`;
}

const STATUS_COLORS: Record<ShiftRequestStatus, { bg: string; text: string; border: string }> = {
  open: { bg: "var(--color-info-bg)", text: "var(--color-info-text)", border: "var(--color-info-border)" },
  pending_approval: { bg: "var(--color-warning-bg)", text: "var(--color-warning-text)", border: "var(--color-warning-border)" },
  approved: { bg: "var(--color-success-bg)", text: "var(--color-success-text)", border: "var(--color-success)" },
  rejected: { bg: "var(--color-danger-bg)", text: "var(--color-danger-dark)", border: "var(--color-danger-border)" },
  cancelled: { bg: "var(--color-bg-secondary)", text: "var(--color-text-subtle)", border: "var(--color-border)" },
  expired: { bg: "var(--color-bg-secondary)", text: "var(--color-text-subtle)", border: "var(--color-border)" },
};

// ── Component ────────────────────────────────────────────────────────────────

export default function ShiftRequestBoard({
  openPickups,
  myRequests,
  pendingApproval,
  loading,
  currentEmpId,
  canApprove,
  onClaim,
  onRespond,
  onResolve,
  onCancel,
  onClose,
}: ShiftRequestBoardProps) {
  const isMobile = useMediaQuery(MOBILE);
  const [activeTab, setActiveTab] = useState<Tab>("available");
  const [rejectNotes, setRejectNotes] = useState<Record<string, string>>({});
  const [showRejectInput, setShowRejectInput] = useState<Record<string, boolean>>({});

  const tabs: { key: Tab; label: string; count: number; visible: boolean }[] = [
    { key: "available", label: "Available Shifts", count: openPickups.length, visible: true },
    { key: "mine", label: "My Requests", count: myRequests.length, visible: true },
    { key: "approval", label: "Approval Queue", count: pendingApproval.length, visible: canApprove },
  ];

  function getTabData(): ShiftRequest[] {
    switch (activeTab) {
      case "available": return openPickups;
      case "mine": return myRequests;
      case "approval": return pendingApproval;
    }
  }

  function getEmptyMessage(): string {
    switch (activeTab) {
      case "available": return "No available shifts";
      case "mine": return "No requests yet";
      case "approval": return "No pending approvals";
    }
  }

  // ── Status badge ─────────────────────────────────────────────────────────

  function renderStatusBadge(status: ShiftRequestStatus) {
    const colors = STATUS_COLORS[status];
    const label = status === "pending_approval" ? "Pending" : status.charAt(0).toUpperCase() + status.slice(1);
    return (
      <span
        style={{
          display: "inline-block",
          fontSize: "var(--dg-fs-footnote)",
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.04em",
          padding: "2px 7px",
          borderRadius: 4,
          background: colors.bg,
          color: colors.text,
          border: `1px solid ${colors.border}`,
          lineHeight: 1.4,
        }}
      >
        {label}
      </span>
    );
  }

  // ── Swap arrow icon ──────────────────────────────────────────────────────

  function renderSwapArrow() {
    return (
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="var(--color-text-muted)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ flexShrink: 0 }}
      >
        <polyline points="17 1 21 5 17 9" />
        <path d="M3 11V9a4 4 0 0 1 4-4h14" />
        <polyline points="7 23 3 19 7 15" />
        <path d="M21 13v2a4 4 0 0 1-4 4H3" />
      </svg>
    );
  }

  // ── Request card ─────────────────────────────────────────────────────────

  function renderCard(req: ShiftRequest) {
    const isSwap = req.type === "swap";
    const isOwnRequest = currentEmpId === req.requesterEmpId;
    const isTarget = currentEmpId === req.targetEmpId;

    return (
      <div
        key={req.id}
        style={{
          border: "1px solid var(--color-border)",
          borderRadius: 10,
          padding: "14px 16px",
          background: "var(--color-surface)",
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        {/* Top row: name + status */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <span
            style={{
              fontSize: "var(--dg-fs-label)",
              fontWeight: 700,
              color: "var(--color-text-primary)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              minWidth: 0,
            }}
          >
            {req.requesterName}
          </span>
          {renderStatusBadge(req.status)}
        </div>

        {/* Shift info */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <span
            style={{
              fontSize: "var(--dg-fs-caption)",
              fontWeight: 600,
              color: "var(--color-text-secondary)",
            }}
          >
            {req.requesterShiftLabel} shift on {formatShiftDate(req.requesterShiftDate)}
          </span>

          {isSwap && req.targetName && req.targetShiftLabel && req.targetShiftDate && (
            <>
              {renderSwapArrow()}
              <span
                style={{
                  fontSize: "var(--dg-fs-caption)",
                  fontWeight: 600,
                  color: "var(--color-text-secondary)",
                }}
              >
                {req.targetName}: {req.targetShiftLabel} on {formatShiftDate(req.targetShiftDate)}
              </span>
            </>
          )}
        </div>

        {/* Expiry */}
        <div
          style={{
            fontSize: "var(--dg-fs-footnote)",
            color: "var(--color-text-muted)",
            display: "flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          <svg
            width="11"
            height="11"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ flexShrink: 0 }}
          >
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
          {timeRemainingLabel(req.expiresAt)}
        </div>

        {/* Action buttons */}
        {renderActions(req, isOwnRequest, isTarget)}
      </div>
    );
  }

  // ── Action buttons ───────────────────────────────────────────────────────

  function renderActions(req: ShiftRequest, isOwnRequest: boolean, isTarget: boolean) {
    const actions: React.ReactNode[] = [];

    // Claim button: open pickup that isn't mine
    if (req.type === "pickup" && req.status === "open" && !isOwnRequest && currentEmpId) {
      actions.push(
        <button
          key="claim"
          className="dg-btn dg-btn-primary"
          onClick={() => onClaim(req.id)}
          style={{ fontSize: "var(--dg-fs-caption)", padding: "7px 14px" }}
        >
          Claim
        </button>,
      );
    }

    // Target of a swap with open status: Accept / Decline
    if (isTarget && req.type === "swap" && req.status === "open") {
      actions.push(
        <button
          key="accept"
          className="dg-btn dg-btn-primary"
          onClick={() => onRespond(req.id, true)}
          style={{ fontSize: "var(--dg-fs-caption)", padding: "7px 14px" }}
        >
          Accept
        </button>,
        <button
          key="decline"
          className="dg-btn dg-btn-ghost"
          onClick={() => onRespond(req.id, false)}
          style={{
            fontSize: "var(--dg-fs-caption)",
            padding: "7px 14px",
            border: "1px solid var(--color-border)",
          }}
        >
          Decline
        </button>,
      );
    }

    // Approve / Reject: admin with permission, request is pending_approval
    if (canApprove && req.status === "pending_approval") {
      const isRejecting = showRejectInput[req.id];

      if (isRejecting) {
        actions.push(
          <div key="reject-form" style={{ width: "100%", display: "flex", flexDirection: "column", gap: 6 }}>
            <textarea
              placeholder="Optional note..."
              value={rejectNotes[req.id] ?? ""}
              onChange={(e) =>
                setRejectNotes((prev) => ({ ...prev, [req.id]: e.target.value }))
              }
              style={{
                width: "100%",
                minHeight: 56,
                padding: "8px 10px",
                border: "1px solid var(--color-border)",
                borderRadius: 8,
                fontSize: "var(--dg-fs-caption)",
                fontFamily: "inherit",
                resize: "vertical",
                outline: "none",
                boxSizing: "border-box",
              }}
            />
            <div style={{ display: "flex", gap: 6 }}>
              <button
                className="dg-btn dg-btn-danger-filled"
                onClick={() => {
                  onResolve(req.id, false, rejectNotes[req.id] || undefined);
                  setShowRejectInput((prev) => ({ ...prev, [req.id]: false }));
                  setRejectNotes((prev) => {
                    const next = { ...prev };
                    delete next[req.id];
                    return next;
                  });
                }}
                style={{
                  flex: 1,
                  fontSize: "var(--dg-fs-caption)",
                  padding: "7px 14px",
                }}
              >
                Confirm Reject
              </button>
              <button
                className="dg-btn dg-btn-ghost"
                onClick={() =>
                  setShowRejectInput((prev) => ({ ...prev, [req.id]: false }))
                }
                style={{
                  fontSize: "var(--dg-fs-caption)",
                  padding: "7px 14px",
                  border: "1px solid var(--color-border)",
                }}
              >
                Back
              </button>
            </div>
          </div>,
        );
      } else {
        actions.push(
          <button
            key="approve"
            className="dg-btn dg-btn-primary"
            onClick={() => onResolve(req.id, true)}
            style={{ fontSize: "var(--dg-fs-caption)", padding: "7px 14px" }}
          >
            Approve
          </button>,
          <button
            key="reject"
            className="dg-btn dg-btn-ghost"
            onClick={() =>
              setShowRejectInput((prev) => ({ ...prev, [req.id]: true }))
            }
            style={{
              fontSize: "var(--dg-fs-caption)",
              padding: "7px 14px",
              border: "1px solid var(--color-danger-border)",
              color: "var(--color-danger)",
            }}
          >
            Reject
          </button>,
        );
      }
    }

    // Cancel: requester can cancel own open/pending request
    if (isOwnRequest && (req.status === "open" || req.status === "pending_approval")) {
      actions.push(
        <button
          key="cancel"
          className="dg-btn dg-btn-ghost"
          onClick={() => onCancel(req.id)}
          style={{
            fontSize: "var(--dg-fs-caption)",
            padding: "7px 14px",
            border: "1px solid var(--color-danger-border)",
            color: "var(--color-danger)",
          }}
        >
          Cancel
        </button>,
      );
    }

    if (actions.length === 0) return null;

    return (
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 2 }}>
        {actions}
      </div>
    );
  }

  // ── Render ───────────────────────────────────────────────────────────────

  const tabData = getTabData();

  return (
    <>
      {/* Backdrop */}
      <div className="dg-panel-overlay" onClick={onClose} />

      {/* Panel */}
      <div className="dg-panel">
        {/* Header */}
        <div
          style={{
            padding: isMobile ? "12px 16px" : "16px 20px",
            borderBottom: "1px solid var(--color-border)",
            display: "flex",
            alignItems: "center",
            gap: 12,
            flexShrink: 0,
            background: "var(--color-surface)",
          }}
        >
          {isMobile && (
            <button
              onClick={onClose}
              aria-label="Back"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 36,
                height: 36,
                background: "transparent",
                border: "none",
                borderRadius: 8,
                cursor: "pointer",
                padding: 0,
                flexShrink: 0,
              }}
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="var(--color-text-primary)"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: "var(--dg-fs-body)",
                fontWeight: 700,
                color: "var(--color-text-secondary)",
              }}
            >
              Shift Requests
            </div>
            <div
              style={{
                fontSize: "var(--dg-fs-caption)",
                color: "var(--color-text-subtle)",
                marginTop: 2,
              }}
            >
              Pickups, swaps, and approvals
            </div>
          </div>
          {!isMobile && (
            <button
              onClick={onClose}
              className="dg-btn dg-btn-ghost"
              style={{
                border: "1px solid var(--color-border)",
                padding: "4px 8px",
                fontSize: "var(--dg-fs-body)",
                lineHeight: 1,
              }}
              title="Close"
            >
              ×
            </button>
          )}
        </div>

        {/* Tab bar */}
        <div
          style={{
            display: "flex",
            borderBottom: "1px solid var(--color-border)",
            background: "var(--color-surface)",
            flexShrink: 0,
            overflowX: "auto",
          }}
        >
          {tabs
            .filter((t) => t.visible)
            .map((tab) => {
              const isActive = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  style={{
                    flex: 1,
                    padding: "10px 12px",
                    fontSize: "var(--dg-fs-caption)",
                    fontWeight: isActive ? 700 : 500,
                    color: isActive ? "var(--color-text-primary)" : "var(--color-text-muted)",
                    background: "transparent",
                    border: "none",
                    borderBottom: isActive ? "2px solid var(--color-text-primary)" : "2px solid transparent",
                    cursor: "pointer",
                    fontFamily: "inherit",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                    whiteSpace: "nowrap",
                    transition: "color 150ms ease, border-color 150ms ease",
                  }}
                >
                  {tab.label}
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      minWidth: 18,
                      height: 18,
                      padding: "0 5px",
                      borderRadius: 9,
                      fontSize: "var(--dg-fs-footnote)",
                      fontWeight: 700,
                      background: isActive ? "var(--color-brand)" : "var(--color-bg-secondary)",
                      color: isActive ? "var(--color-text-inverse)" : "var(--color-text-muted)",
                      lineHeight: 1,
                    }}
                  >
                    {tab.count}
                  </span>
                </button>
              );
            })}
        </div>

        {/* Scrollable content */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: isMobile ? "16px" : "20px 24px",
          }}
        >
          {loading ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "40px 0",
                color: "var(--color-text-muted)",
                fontSize: "var(--dg-fs-label)",
              }}
            >
              Loading requests...
            </div>
          ) : tabData.length === 0 ? (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                padding: "40px 0",
                gap: 8,
              }}
            >
              <svg
                width="32"
                height="32"
                viewBox="0 0 24 24"
                fill="none"
                stroke="var(--color-text-muted)"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ opacity: 0.5 }}
              >
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
              <span
                style={{
                  fontSize: "var(--dg-fs-label)",
                  color: "var(--color-text-muted)",
                  fontWeight: 500,
                }}
              >
                {getEmptyMessage()}
              </span>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {tabData.map((req) => renderCard(req))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
