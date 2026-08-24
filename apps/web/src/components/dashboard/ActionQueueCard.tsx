"use client";

import Link from "next/link";
import { useState } from "react";
import ConfirmDialog from "@/components/ConfirmDialog";
import { Button } from "@/components/Button";
import { formatShiftRequestTypeLabel } from "@/lib/client-facing";
import type { ShiftRequest } from "@/types";
import type { OpenShift } from "@/lib/dashboard-stats";

export interface ActionItem {
  id: string;
  type: "approval" | "swap_proposal" | "pickup" | "coverage_gap" | "draft";
  title: string;
  subtitle: string;
  urgency: "high" | "medium" | "low";
  href?: string;
  action?: { label: string; onClick: () => void | Promise<unknown> };
  secondaryAction?: { label: string; onClick: () => void | Promise<unknown> };
}

const URGENCY_DOT: Record<string, string> = {
  high: "var(--color-danger)",
  medium: "var(--color-warning)",
  low: "var(--color-info)",
};

function getRequestShiftName(request: ShiftRequest): string {
  const segmentNames =
    request.requesterPresentation?.segments
      ?.map((segment) => segment.shiftName?.trim())
      .filter((name): name is string => Boolean(name)) ?? [];
  const uniqueSegmentNames = [...new Set(segmentNames)];

  if (uniqueSegmentNames.length > 0) {
    return uniqueSegmentNames.join(" + ");
  }

  return (
    request.requesterPresentation?.shiftName?.trim() ||
    request.requesterPresentation?.label?.trim() ||
    request.requesterShiftLabel
  );
}

interface ActionQueueCardProps {
  items: ActionItem[];
  maxVisible?: number;
  variant?: "card" | "hero";
  grouped?: boolean;
}

export function buildActionItems({
  isAdmin,
  pendingApproval,
  swapProposals,
  openPickups,
  openShifts,
  draftTotal,
  currentEmpId,
  onResolve,
  onRespond,
  onClaim,
}: {
  isAdmin: boolean;
  pendingApproval: ShiftRequest[];
  swapProposals: ShiftRequest[];
  openPickups: ShiftRequest[];
  openShifts: OpenShift[];
  draftTotal: number;
  currentEmpId: string | null;
  onResolve?: (id: string, approved: boolean) => Promise<boolean>;
  onRespond?: (id: string, empId: string, accept: boolean) => Promise<boolean>;
  onClaim?: (id: string, empId: string) => Promise<boolean>;
}): ActionItem[] {
  const items: ActionItem[] = [];

  if (isAdmin) {
    // Pending approvals
    for (const req of pendingApproval.slice(0, 3)) {
      const shiftName = getRequestShiftName(req);
      items.push({
        id: `approval-${req.id}`,
        type: "approval",
        title: `${req.requesterName} requested ${formatShiftRequestTypeLabel(req.type).toLowerCase()}`,
        subtitle: `${shiftName} \u00B7 ${req.requesterShiftDate}`,
        urgency: "high",
        action: onResolve
          ? { label: "Approve", onClick: () => onResolve(req.id, true) }
          : undefined,
        secondaryAction: onResolve
          ? { label: "Reject", onClick: () => onResolve(req.id, false) }
          : undefined,
      });
    }

    // Draft changes
    if (draftTotal > 0) {
      items.push({
        id: "draft-changes",
        type: "draft",
        title: `${draftTotal} unpublished change${draftTotal !== 1 ? "s" : ""}`,
        subtitle: "Review and publish in schedule",
        urgency: "medium",
        href: "/schedule",
      });
    }

    // Coverage gaps
    const highUrgency = openShifts.filter((s) => s.urgency === "high");
    const highUrgencySlotCount = highUrgency.reduce((total, shift) => total + shift.needed, 0);
    if (highUrgencySlotCount > 0) {
      items.push({
        id: "coverage-gaps",
        type: "coverage_gap",
        title: `${highUrgencySlotCount} urgent coverage slot${highUrgencySlotCount !== 1 ? "s" : ""}`,
        subtitle: "Understaffed shifts need attention",
        urgency: "high",
        href: "/schedule",
      });
    }
  } else {
    // User: swap proposals
    for (const req of swapProposals.slice(0, 3)) {
      const shiftName = getRequestShiftName(req);
      items.push({
        id: `swap-${req.id}`,
        type: "swap_proposal",
        title: `${req.requesterName} wants to swap shifts`,
        subtitle: `${shiftName} \u00B7 ${req.requesterShiftDate}`,
        urgency: "high",
        action:
          onRespond && currentEmpId != null
            ? {
                label: "Accept",
                onClick: () => onRespond(req.id, String(currentEmpId), true),
              }
            : undefined,
        secondaryAction:
          onRespond && currentEmpId != null
            ? {
                label: "Decline",
                onClick: () => onRespond(req.id, String(currentEmpId), false),
              }
            : undefined,
      });
    }

    // User: open pickups
    for (const req of openPickups.slice(0, 3)) {
      const shiftName = getRequestShiftName(req);
      items.push({
        id: `pickup-${req.id}`,
        type: "pickup",
        title: `Open shift: ${shiftName}`,
        subtitle: `${req.requesterShiftDate}`,
        urgency: "low",
        action:
          onClaim && currentEmpId != null
            ? {
                label: "Claim",
                onClick: () => onClaim(req.id, String(currentEmpId)),
              }
            : undefined,
      });
    }
  }

  // Sort by urgency
  const urgencyOrder = { high: 0, medium: 1, low: 2 };
  items.sort((a, b) => urgencyOrder[a.urgency] - urgencyOrder[b.urgency]);

  return items;
}

const TYPE_LABELS: Record<string, string> = {
  approval: "Approvals",
  swap_proposal: "Swap Proposals",
  pickup: "Open Pickups",
  coverage_gap: "Coverage Gaps",
  draft: "Unpublished Changes",
};

const TYPE_ORDER = ["approval", "coverage_gap", "draft", "swap_proposal", "pickup"];

// What each row action says while it runs, beside its spinner.
const RUNNING_LABELS: Record<string, string> = {
  Accept: "Accepting",
  Approve: "Approving",
  Claim: "Claiming",
  Decline: "Declining",
  Reject: "Rejecting",
};

function ActionItemRow({ item, showBorder }: { item: ActionItem; showBorder: boolean }) {
  const [pendingAction, setPendingAction] = useState<{
    label: string;
    onClick: () => void | Promise<unknown>;
  } | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const confirmationTitle = pendingAction
    ? `${pendingAction.label} request?`
    : "Confirm request action?";
  const confirmationVariant =
    pendingAction?.label === "Reject" || pendingAction?.label === "Decline" ? "danger" : "info";

  async function confirmAction() {
    if (!pendingAction || isRunning) return;

    setIsRunning(true);
    try {
      await pendingAction.onClick();
      setPendingAction(null);
    } finally {
      setIsRunning(false);
    }
  }

  const content = (
    <>
      {pendingAction && (
        <ConfirmDialog
          confirmLabel={pendingAction.label}
          confirmPendingLabel={RUNNING_LABELS[pendingAction.label] ?? pendingAction.label}
          isLoading={isRunning}
          message={
            <>
              {pendingAction.label} <strong>{item.title}</strong>?
            </>
          }
          title={confirmationTitle}
          variant={confirmationVariant}
          onCancel={() => {
            if (!isRunning) setPendingAction(null);
          }}
          onConfirm={() => confirmAction()}
        />
      )}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "10px 18px",
          borderBottom: showBorder ? "1px solid var(--color-border-light)" : "none",
        }}
      >
        {/* Urgency dot */}
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: URGENCY_DOT[item.urgency],
            flexShrink: 0,
          }}
        />

        {/* Content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 12,
              fontWeight: 500,
              color: "var(--color-text-primary)",
            }}
          >
            {item.title}
          </div>
          <div
            style={{
              fontSize: 10,
              color: "var(--color-text-subtle)",
              marginTop: 1,
            }}
          >
            {item.subtitle}
          </div>
        </div>

        {/* Actions */}
        {(item.action || item.secondaryAction) && (
          <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
            {item.action && (
              <Button
                disabled={isRunning}
                onClick={() => setPendingAction(item.action ?? null)}
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  padding: "3px 8px",
                  borderRadius: 5,
                  background: "var(--color-success)",
                  color: "#fff",
                  border: "none",
                  cursor: isRunning ? "not-allowed" : "pointer",
                }}
              >
                {item.action.label}
              </Button>
            )}
            {item.secondaryAction && (
              <Button
                disabled={isRunning}
                onClick={() => setPendingAction(item.secondaryAction ?? null)}
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  padding: "3px 8px",
                  borderRadius: 5,
                  background: "transparent",
                  color: "var(--color-text-subtle)",
                  border: "1px solid var(--color-border)",
                  cursor: isRunning ? "not-allowed" : "pointer",
                }}
              >
                {item.secondaryAction.label}
              </Button>
            )}
          </div>
        )}

        {/* Link arrow for href items */}
        {item.href && !item.action && (
          <span
            style={{
              fontSize: 11,
              color: "var(--color-primary)",
              fontWeight: 500,
            }}
          >
            &rarr;
          </span>
        )}
      </div>
    </>
  );

  if (item.href && !item.action) {
    return (
      <Link key={item.id} href={item.href} style={{ textDecoration: "none", color: "inherit" }}>
        {content}
      </Link>
    );
  }
  return content;
}

function GroupedItems({ items }: { items: ActionItem[] }) {
  const groups = TYPE_ORDER.map((type) => ({
    type,
    items: items.filter((i) => i.type === type),
  })).filter((g) => g.items.length > 0);

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {groups.map((group, gi) => (
        <div key={group.type}>
          {/* Section header */}
          <div
            style={{
              padding: "8px 18px 4px",
              fontSize: "var(--dg-fs-micro)",
              fontWeight: 600,
              color: "var(--color-text-subtle)",
              textTransform: "uppercase",
              letterSpacing: "0.04em",
              borderTop: gi > 0 ? "1px solid var(--color-border-light)" : "none",
            }}
          >
            {TYPE_LABELS[group.type] || group.type} ({group.items.length})
          </div>
          {group.items.map((item, i) => (
            <ActionItemRow key={item.id} item={item} showBorder={i < group.items.length - 1} />
          ))}
        </div>
      ))}
    </div>
  );
}

function FlatItems({ items }: { items: ActionItem[] }) {
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {items.map((item, i) => (
        <ActionItemRow key={item.id} item={item} showBorder={i < items.length - 1} />
      ))}
    </div>
  );
}

export default function ActionQueueCard({
  items,
  maxVisible = 6,
  variant = "card",
  grouped = false,
}: ActionQueueCardProps) {
  const visible = items.slice(0, maxVisible);
  const isHero = variant === "hero";

  if (items.length === 0) {
    return (
      <div className={isHero ? undefined : "dg-card"}>
        <div
          style={{
            textAlign: "center",
            padding: isHero ? "32px 18px" : "24px 18px",
          }}
        >
          {/* Green checkmark */}
          <div
            style={{
              width: isHero ? 48 : 36,
              height: isHero ? 48 : 36,
              borderRadius: "50%",
              background: "var(--color-success-bg)",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 10,
            }}
          >
            <svg
              width={isHero ? 24 : 18}
              height={isHero ? 24 : 18}
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--color-success-text)"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M4 12l6 6L20 6" />
            </svg>
          </div>
          <div
            style={{
              fontSize: isHero ? "var(--dg-fs-body)" : 12,
              fontWeight: 600,
              color: "var(--color-text-primary)",
              marginBottom: 2,
            }}
          >
            All clear
          </div>
          <div
            style={{
              fontSize: "var(--dg-fs-small)",
              color: "var(--color-text-subtle)",
            }}
          >
            No action items right now
          </div>
        </div>
      </div>
    );
  }

  const header = (
    <div
      className={isHero ? undefined : "dg-card-header"}
      style={isHero ? { padding: "0 0 8px" } : undefined}
    >
      <div>
        <div
          className={isHero ? undefined : "dg-card-title"}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            ...(isHero
              ? {
                  fontSize: "var(--dg-fs-body)",
                  fontWeight: 700,
                  color: "var(--color-text-primary)",
                }
              : {}),
          }}
        >
          Review queue
        </div>
      </div>
    </div>
  );

  const body = grouped ? <GroupedItems items={visible} /> : <FlatItems items={visible} />;

  if (isHero) {
    return (
      <div
        style={{
          borderRadius: "var(--dg-radius-md)",
          background: "var(--color-surface)",
          border: "1px solid var(--color-border-light)",
          overflow: "hidden",
        }}
      >
        <div style={{ padding: "12px 18px 0" }}>{header}</div>
        {body}
      </div>
    );
  }

  return (
    <div className="dg-card">
      {header}
      {body}
    </div>
  );
}
