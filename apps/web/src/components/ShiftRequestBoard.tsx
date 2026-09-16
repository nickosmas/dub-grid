"use client";
import { ChevronLeft, Clock } from "lucide-react";

import { Fragment, useState } from "react";
import { createPortal } from "react-dom";
import { useTheme } from "next-themes";
import type { ReactNode } from "react";
import type { ShiftRequest, ShiftRequestStatus, AbsenceType } from "@/types";
import { Button } from "@/components/Button";
import { useMediaQuery, MOBILE } from "@/hooks";
import { useSlideoverClose } from "@/hooks/useSlideoverClose";
import { CloseButton } from "@/components/ui/CloseButton";
import { ScrollOverflowCue } from "@/components/ui/ScrollOverflowCue";
import { EmptyState } from "@/components/EmptyState";
import ConfirmDialog from "@/components/ConfirmDialog";
import ProgressBar from "@/components/ProgressBar";
import ScrollableTabs from "@/components/ScrollableTabs";
import { joinShiftJobSegmentNames } from "@/lib/shift-job-segments";
import { joinAssignmentNames } from "@/lib/assignable-shifts";
import { resolveShiftPillColors } from "@/lib/colors";
import { StatusPill, type StatusPillTone } from "@/components/ui/status-pill";
import { NumericBadge } from "@/components/ui/numeric-badge";

// ── Types ────────────────────────────────────────────────────────────────────

interface ShiftRequestBoardProps {
  openPickups: ShiftRequest[];
  myRequests: ShiftRequest[];
  pendingApproval: ShiftRequest[];
  approvalQueue?: ShiftRequest[];
  canViewAllRequests?: boolean;
  loading: boolean;
  currentEmpId: string | null;
  canApprove: boolean;
  onClaim: (requestId: string) => void | Promise<unknown>;
  onRespond: (requestId: string, accept: boolean) => void | Promise<unknown>;
  onResolve: (requestId: string, approved: boolean, note?: string) => void | Promise<unknown>;
  onCancel: (requestId: string) => void | Promise<unknown>;
  onClose: () => void;
  absenceTypeMap?: Map<number, AbsenceType>;
  assignmentNameMap: Map<number, string>;
}

type Tab = "available" | "mine" | "approval";
type PendingConfirmation = {
  confirmLabel: string;
  key: string;
  message: ReactNode;
  onConfirm: () => void | Promise<unknown>;
  title: string;
  variant?: "danger" | "warning" | "info";
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatShiftDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
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

const STATUS_TONES: Record<ShiftRequestStatus, StatusPillTone> = {
  open: "info",
  pending_approval: "warning",
  approved: "success",
  rejected: "danger",
  cancelled: "neutral",
  expired: "neutral",
};

// ── Component ────────────────────────────────────────────────────────────────

export default function ShiftRequestBoard({
  openPickups,
  myRequests,
  pendingApproval,
  approvalQueue,
  canViewAllRequests = false,
  loading,
  currentEmpId,
  canApprove,
  onClaim,
  onRespond,
  onResolve,
  onCancel,
  onClose,
  absenceTypeMap,
  assignmentNameMap,
}: ShiftRequestBoardProps) {
  const isMobile = useMediaQuery(MOBILE);
  const { closing, close } = useSlideoverClose(onClose);
  const { resolvedTheme } = useTheme();
  const isDarkTheme = resolvedTheme === "dark";
  const [activeTab, setActiveTab] = useState<Tab>("available");
  const [rejectNotes, setRejectNotes] = useState<Record<string, string>>({});
  const [showRejectInput, setShowRejectInput] = useState<Record<string, boolean>>({});
  const [pendingConfirmation, setPendingConfirmation] = useState<PendingConfirmation | null>(null);
  const [runningConfirmationKey, setRunningConfirmationKey] = useState<string | null>(null);
  const managerQueue = [...(approvalQueue ?? pendingApproval)].sort((left, right) => {
    const statusPriority = (status: ShiftRequestStatus) =>
      status === "pending_approval" ? 0 : status === "open" ? 1 : 2;
    const byStatus = statusPriority(left.status) - statusPriority(right.status);
    if (byStatus !== 0) {
      return byStatus;
    }

    return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
  });
  const hasRunningAction = runningConfirmationKey != null;

  async function confirmPendingAction() {
    if (!pendingConfirmation || runningConfirmationKey) return;

    setRunningConfirmationKey(pendingConfirmation.key);
    try {
      await pendingConfirmation.onConfirm();
      setPendingConfirmation(null);
    } finally {
      setRunningConfirmationKey(null);
    }
  }

  const tabs: { key: Tab; label: string; count: number; visible: boolean }[] = [
    { key: "available", label: "Available Shifts", count: openPickups.length, visible: true },
    { key: "mine", label: "My Requests", count: myRequests.length, visible: true },
    {
      key: "approval",
      label: canApprove ? "Approval Queue" : "All Requests",
      count: managerQueue.length,
      visible: canApprove || canViewAllRequests,
    },
  ];

  function getTabData(): ShiftRequest[] {
    switch (activeTab) {
      case "available":
        return openPickups;
      case "mine":
        return myRequests;
      case "approval":
        return managerQueue;
    }
  }

  function getEmptyMessage(): string {
    switch (activeTab) {
      case "available":
        return "No available shifts";
      case "mine":
        return "No requests yet";
      case "approval":
        return canApprove ? "No active requests" : "No organization requests";
    }
  }

  // ── Status badge ─────────────────────────────────────────────────────────

  function renderStatusBadge(status: ShiftRequestStatus) {
    const label =
      status === "pending_approval" ? "Pending" : status.charAt(0).toUpperCase() + status.slice(1);
    return (
      <StatusPill tone={STATUS_TONES[status]} className="uppercase tracking-wide">
        {label}
      </StatusPill>
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
        stroke="var(--dg-color-text-muted)"
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
    const isCalloff = req.type === "calloff";
    const isOwnRequest = currentEmpId === req.requesterEmpId;
    const isTarget = currentEmpId === req.targetEmpId;
    const absenceType =
      isCalloff && req.absenceTypeId ? absenceTypeMap?.get(req.absenceTypeId) : null;
    const absenceTypeColors = absenceType
      ? resolveShiftPillColors(
          { color: absenceType.color, text: absenceType.text, border: absenceType.border },
          isDarkTheme,
        )
      : null;
    // Segments only carry names once the server resolved them; fall back to
    // resolving the assignment ids through the full-name map, and only then
    // to the (possibly abbreviated) server-baked label.
    const requesterLabel =
      joinShiftJobSegmentNames(req.requesterSegments ?? []) ||
      joinAssignmentNames(req.requesterAssignmentDefinitionIds, assignmentNameMap) ||
      req.requesterShiftLabel;
    const targetLabel =
      joinShiftJobSegmentNames(req.targetSegments ?? []) ||
      joinAssignmentNames(req.targetAssignmentDefinitionIds ?? [], assignmentNameMap) ||
      req.targetShiftLabel;

    return (
      <div
        key={req.id}
        style={{
          border: isCalloff
            ? "1px solid var(--dg-color-danger-border, #FCA5A5)"
            : "1px solid var(--dg-color-border)",
          borderRadius: "var(--dg-radius-md)",
          padding: "14px 16px",
          background: "var(--dg-color-surface)",
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        {/* Top row: name + status */}
        <div
          style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}
        >
          <span
            style={{
              fontSize: "var(--dg-fs-label)",
              fontWeight: 700,
              color: "var(--dg-color-text-primary)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              minWidth: 0,
            }}
          >
            {req.requesterName}
          </span>
          <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
            {isCalloff && (
              <span
                style={{
                  fontSize: "var(--dg-type-badge-size)",
                  fontWeight: 500,
                  padding: "2px 7px",
                  borderRadius: "var(--dg-radius-sm)",
                  background: "var(--dg-color-danger-bg, #FEF2F2)",
                  color: "var(--dg-color-danger-text, #991B1B)",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                Calloff
              </span>
            )}
            {renderStatusBadge(req.status)}
          </div>
        </div>

        {/* Shift info */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <span
            style={{
              fontSize: "var(--dg-fs-caption)",
              fontWeight: 600,
              color: "var(--dg-color-text-secondary)",
            }}
          >
            {requesterLabel} on {formatShiftDate(req.requesterShiftDate)}
          </span>

          {isSwap && req.targetName && req.targetShiftLabel && req.targetShiftDate && (
            <>
              {renderSwapArrow()}
              <span
                style={{
                  fontSize: "var(--dg-fs-caption)",
                  fontWeight: 600,
                  color: "var(--dg-color-text-secondary)",
                }}
              >
                {req.targetName}: {targetLabel} on {formatShiftDate(req.targetShiftDate)}
              </span>
            </>
          )}

          {isCalloff && absenceType && (
            <span
              style={{
                fontSize: "var(--dg-fs-caption)",
                fontWeight: 600,
                padding: "2px 8px",
                borderRadius: "var(--dg-radius-sm)",
                background: absenceTypeColors?.color || "var(--dg-color-surface-alt)",
                color: absenceTypeColors?.text || "var(--dg-color-text-primary)",
                border: `1px solid ${absenceTypeColors?.border || "var(--dg-color-border)"}`,
              }}
            >
              {absenceType.label} — {absenceType.name}
            </span>
          )}
        </div>

        {/* Expiry */}
        <div
          style={{
            fontSize: "var(--dg-fs-footnote)",
            color: "var(--dg-color-text-muted)",
            display: "flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          <Clock size={11} strokeWidth={2.5} style={{ flexShrink: 0 }} />
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
    const primaryActions: React.ReactNode[] = [];
    const requesterFullLabel =
      joinShiftJobSegmentNames(req.requesterSegments ?? []) ||
      joinAssignmentNames(req.requesterAssignmentDefinitionIds, assignmentNameMap) ||
      req.requesterShiftLabel;
    const requestLabel = `${requesterFullLabel} on ${formatShiftDate(req.requesterShiftDate)}`;

    // Claim button: open pickup that isn't mine
    if (
      req.type === "pickup" &&
      req.status === "open" &&
      req.targetEmpId == null &&
      !isOwnRequest &&
      currentEmpId
    ) {
      primaryActions.push(
        <Button
          key="claim"
          className="dg-btn dg-btn-primary"
          disabled={hasRunningAction}
          onClick={() =>
            setPendingConfirmation({
              confirmLabel: "Claim",
              key: `claim:${req.id}`,
              message: (
                <>
                  Claim <strong>{requesterFullLabel}</strong> on{" "}
                  <strong>{formatShiftDate(req.requesterShiftDate)}</strong>? This will be sent for
                  manager approval.
                </>
              ),
              onConfirm: () => onClaim(req.id),
              title: "Claim this shift?",
              variant: "info",
            })
          }
          style={{ fontSize: "var(--dg-fs-caption)", padding: "7px 14px" }}
        >
          Claim
        </Button>,
      );
    }

    // Target of a swap or targeted pickup with open status: Accept / Decline
    if (isTarget && (req.type === "swap" || req.type === "pickup") && req.status === "open") {
      primaryActions.push(
        <Button
          key="accept"
          className="dg-btn dg-btn-primary"
          disabled={hasRunningAction}
          onClick={() =>
            setPendingConfirmation({
              confirmLabel: "Accept",
              key: `accept:${req.id}`,
              message: (
                <>
                  Accept {req.requesterName}&apos;s request for <strong>{requestLabel}</strong>?
                </>
              ),
              onConfirm: () => onRespond(req.id, true),
              title: "Accept request?",
              variant: "info",
            })
          }
          style={{ fontSize: "var(--dg-fs-caption)", padding: "7px 14px" }}
        >
          Accept
        </Button>,
      );
      actions.push(
        <Button
          key="decline"
          className="dg-btn dg-btn-ghost"
          disabled={hasRunningAction}
          onClick={() =>
            setPendingConfirmation({
              confirmLabel: "Decline",
              key: `decline:${req.id}`,
              message: (
                <>
                  Decline {req.requesterName}&apos;s request for <strong>{requestLabel}</strong>?
                </>
              ),
              onConfirm: () => onRespond(req.id, false),
              title: "Decline request?",
              variant: "danger",
            })
          }
          style={{
            fontSize: "var(--dg-fs-caption)",
            padding: "7px 14px",
            border: "1px solid var(--dg-color-border)",
          }}
        >
          Decline
        </Button>,
      );
    }

    // Approve / Reject: admin with permission, request is pending_approval
    if (canApprove && req.status === "pending_approval") {
      const isRejecting = showRejectInput[req.id];

      if (isRejecting) {
        actions.push(
          <div
            key="reject-form"
            style={{ width: "100%", display: "flex", flexDirection: "column", gap: 6 }}
          >
            <textarea
              placeholder="Add a note (optional)"
              value={rejectNotes[req.id] ?? ""}
              onChange={(e) => setRejectNotes((prev) => ({ ...prev, [req.id]: e.target.value }))}
              style={{
                width: "100%",
                minHeight: 56,
                padding: "8px 10px",
                border: "1px solid var(--dg-color-border)",
                borderRadius: "var(--dg-radius-md)",
                fontSize: "var(--dg-fs-caption)",
                fontFamily: "inherit",
                resize: "vertical",
                outline: "none",
                boxSizing: "border-box",
              }}
            />
            <div style={{ display: "flex", gap: 6 }}>
              <Button
                className="dg-btn dg-btn-ghost"
                onClick={() => setShowRejectInput((prev) => ({ ...prev, [req.id]: false }))}
                style={{
                  fontSize: "var(--dg-fs-caption)",
                  padding: "7px 14px",
                  border: "1px solid var(--dg-color-border)",
                }}
              >
                Back
              </Button>
              <Button
                className="dg-btn dg-btn-danger-filled"
                disabled={hasRunningAction}
                onClick={() => {
                  const note = rejectNotes[req.id] || undefined;

                  setPendingConfirmation({
                    confirmLabel: "Reject",
                    key: `reject:${req.id}`,
                    message: (
                      <>
                        Reject {req.requesterName}&apos;s request for{" "}
                        <strong>{requestLabel}</strong>? The original schedule will stay in place.
                      </>
                    ),
                    onConfirm: async () => {
                      await onResolve(req.id, false, note);
                      setShowRejectInput((prev) => ({ ...prev, [req.id]: false }));
                      setRejectNotes((prev) => {
                        const next = { ...prev };
                        delete next[req.id];
                        return next;
                      });
                    },
                    title: "Reject request?",
                    variant: "danger",
                  });
                }}
                style={{
                  flex: 1,
                  fontSize: "var(--dg-fs-caption)",
                  padding: "7px 14px",
                }}
              >
                Confirm Reject
              </Button>
            </div>
          </div>,
        );
      } else {
        primaryActions.push(
          <Button
            key="approve"
            className="dg-btn dg-btn-primary"
            disabled={hasRunningAction}
            onClick={() =>
              setPendingConfirmation({
                confirmLabel: "Approve",
                key: `approve:${req.id}`,
                message: (
                  <>
                    Approve {req.requesterName}&apos;s request for <strong>{requestLabel}</strong>?
                    This will finalize the staffing change.
                  </>
                ),
                onConfirm: () => onResolve(req.id, true),
                title: "Approve request?",
                variant: "info",
              })
            }
            style={{ fontSize: "var(--dg-fs-caption)", padding: "7px 14px" }}
          >
            Approve
          </Button>,
        );
        actions.push(
          <Button
            key="reject"
            className="dg-btn dg-btn-ghost"
            onClick={() => setShowRejectInput((prev) => ({ ...prev, [req.id]: true }))}
            style={{
              fontSize: "var(--dg-fs-caption)",
              padding: "7px 14px",
              border: "1px solid var(--dg-color-danger-border)",
              color: "var(--dg-color-danger)",
            }}
          >
            Reject
          </Button>,
        );
      }
    }

    // Cancel: requester can cancel own open/pending request
    if (isOwnRequest && (req.status === "open" || req.status === "pending_approval")) {
      actions.push(
        <Button
          key="cancel"
          className="dg-btn dg-btn-ghost"
          disabled={hasRunningAction}
          onClick={() =>
            setPendingConfirmation({
              confirmLabel: "Cancel request",
              key: `cancel:${req.id}`,
              message: (
                <>
                  Cancel your request for <strong>{requestLabel}</strong>? It will no longer be
                  available for review.
                </>
              ),
              onConfirm: () => onCancel(req.id),
              title: "Cancel request?",
              variant: "danger",
            })
          }
          style={{
            fontSize: "var(--dg-fs-caption)",
            padding: "7px 14px",
            border: "1px solid var(--dg-color-danger-border)",
            color: "var(--dg-color-danger)",
          }}
        >
          Cancel
        </Button>,
      );
    }

    const orderedActions = [...actions, ...primaryActions];
    if (orderedActions.length === 0) return null;

    return (
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 2 }}>
        {orderedActions}
      </div>
    );
  }

  // ── Render ───────────────────────────────────────────────────────────────

  const tabData = getTabData();

  return createPortal(
    <>
      <ProgressBar loading={loading} />
      {pendingConfirmation && (
        <ConfirmDialog
          confirmLabel={pendingConfirmation.confirmLabel}
          isLoading={runningConfirmationKey === pendingConfirmation.key}
          message={pendingConfirmation.message}
          title={pendingConfirmation.title}
          variant={pendingConfirmation.variant}
          onCancel={() => {
            if (!runningConfirmationKey) {
              setPendingConfirmation(null);
            }
          }}
          onConfirm={() => confirmPendingAction()}
        />
      )}
      {/* Backdrop */}
      <div className={`dg-panel-overlay${closing ? " closing" : ""}`} onClick={close} />

      {/* Panel */}
      <div
        className={`dg-panel${closing ? " closing" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label="Shift requests"
      >
        {/* Header */}
        <div
          style={{
            padding: isMobile ? "12px 16px" : "16px 20px",
            borderBottom: "1px solid var(--dg-color-border)",
            display: "flex",
            alignItems: "center",
            gap: 12,
            flexShrink: 0,
            background: "var(--dg-color-surface)",
          }}
        >
          {isMobile && (
            <Button
              onClick={close}
              aria-label="Back"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 36,
                height: 36,
                background: "transparent",
                border: "none",
                borderRadius: "var(--dg-radius-md)",
                cursor: "pointer",
                padding: 0,
                flexShrink: 0,
              }}
            >
              <ChevronLeft size={20} color="var(--dg-color-text-primary)" />
            </Button>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: "var(--dg-fs-body)",
                fontWeight: 700,
                color: "var(--dg-color-text-secondary)",
              }}
            >
              Shift Requests
            </div>
            <div
              style={{
                fontSize: "var(--dg-fs-caption)",
                color: "var(--dg-color-text-subtle)",
                marginTop: 2,
              }}
            >
              Pickups, swaps, and approvals
            </div>
          </div>
          {!isMobile && <CloseButton size="md" onClick={close} aria-label="Close panel" />}
        </div>

        {/* Tab bar */}
        <div
          style={{
            padding: "12px 20px",
            borderBottom: "1px solid var(--dg-color-border)",
            background: "var(--dg-color-surface)",
            flexShrink: 0,
          }}
        >
          <ScrollableTabs className="dg-span-tabs dg-span-tabs--light">
            {tabs
              .filter((t) => t.visible)
              .map((tab, i, visibleTabs) => {
                const isActive = activeTab === tab.key;
                const prevActive = i > 0 && activeTab === visibleTabs[i - 1].key;
                const showDivider = i > 0 && !isActive && !prevActive;
                return (
                  <Fragment key={tab.key}>
                    {i > 0 && (
                      <div
                        style={{
                          width: 1,
                          height: 16,
                          background: showDivider ? "var(--dg-color-border)" : "transparent",
                          flexShrink: 0,
                          alignSelf: "center",
                        }}
                      />
                    )}
                    <Button
                      onClick={() => setActiveTab(tab.key)}
                      className={`dg-span-tab${isActive ? " active" : ""}`}
                    >
                      {tab.label}
                      {tab.count > 0 && (
                        <NumericBadge
                          value={tab.count}
                          size="sm"
                          style={{
                            marginLeft: 6,
                            background: isActive
                              ? "rgba(255,255,255,0.25)"
                              : "var(--dg-color-border-light)",
                            color: isActive ? "inherit" : "var(--dg-color-text-muted)",
                            fontWeight: 700,
                          }}
                        />
                      )}
                    </Button>
                  </Fragment>
                );
              })}
          </ScrollableTabs>
        </div>

        {/* Scrollable content */}
        <div
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: "auto",
            padding: isMobile ? "16px" : "20px 24px",
          }}
        >
          {tabData.length === 0 ? (
            loading ? null : (
              <EmptyState
                icon={
                  <svg
                    width="32"
                    height="32"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                    <line x1="16" y1="2" x2="16" y2="6" />
                    <line x1="8" y1="2" x2="8" y2="6" />
                    <line x1="3" y1="10" x2="21" y2="10" />
                  </svg>
                }
                title={getEmptyMessage()}
                style={{ padding: "40px 24px", border: "none", background: "transparent" }}
              />
            )
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {tabData.map((req) => renderCard(req))}
            </div>
          )}
        </div>
        <ScrollOverflowCue />
      </div>
    </>,
    document.body,
  );
}
