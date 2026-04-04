import Link from "next/link";
import type { ShiftRequest } from "@/types";
import type { OTAlert, OpenShift } from "@/lib/dashboard-stats";

export interface ActionItem {
  id: string;
  type: "approval" | "swap_proposal" | "pickup" | "coverage_gap" | "ot_alert" | "draft";
  title: string;
  subtitle: string;
  urgency: "high" | "medium" | "low";
  href?: string;
  action?: { label: string; onClick: () => void };
  secondaryAction?: { label: string; onClick: () => void };
}

const URGENCY_DOT: Record<string, string> = {
  high: "var(--color-danger)",
  medium: "var(--color-warning)",
  low: "var(--color-info)",
};

interface ActionQueueCardProps {
  items: ActionItem[];
  maxVisible?: number;
}

export function buildActionItems({
  isAdmin,
  pendingApproval,
  swapProposals,
  openPickups,
  otAlerts,
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
  otAlerts: OTAlert[];
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
      items.push({
        id: `approval-${req.id}`,
        type: "approval",
        title: `${req.requesterName} requested ${req.type}`,
        subtitle: `${req.requesterShiftLabel} \u00B7 ${req.requesterShiftDate}`,
        urgency: "high",
        action: onResolve ? { label: "Approve", onClick: () => onResolve(req.id, true) } : undefined,
        secondaryAction: onResolve ? { label: "Reject", onClick: () => onResolve(req.id, false) } : undefined,
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

    // OT alerts
    for (const alert of otAlerts.slice(0, 2)) {
      items.push({
        id: `ot-${alert.empId}`,
        type: "ot_alert",
        title: `${alert.empName} projected to exceed 40h`,
        subtitle: `${alert.totalHours.toFixed(1)}h scheduled \u00B7 ${alert.focusAreaName}`,
        urgency: "high",
        href: "/schedule",
      });
    }

    // Coverage gaps
    const highUrgency = openShifts.filter((s) => s.urgency === "high");
    if (highUrgency.length > 0) {
      items.push({
        id: "coverage-gaps",
        type: "coverage_gap",
        title: `${highUrgency.length} urgent coverage gap${highUrgency.length !== 1 ? "s" : ""}`,
        subtitle: "Understaffed shifts need attention",
        urgency: "high",
        href: "/schedule",
      });
    }
  } else {
    // User: swap proposals
    for (const req of swapProposals.slice(0, 3)) {
      items.push({
        id: `swap-${req.id}`,
        type: "swap_proposal",
        title: `${req.requesterName} wants to swap shifts`,
        subtitle: `${req.requesterShiftLabel} \u00B7 ${req.requesterShiftDate}`,
        urgency: "high",
        action: onRespond && currentEmpId != null
          ? { label: "Accept", onClick: () => onRespond(req.id, String(currentEmpId), true) }
          : undefined,
        secondaryAction: onRespond && currentEmpId != null
          ? { label: "Decline", onClick: () => onRespond(req.id, String(currentEmpId), false) }
          : undefined,
      });
    }

    // User: open pickups
    for (const req of openPickups.slice(0, 3)) {
      items.push({
        id: `pickup-${req.id}`,
        type: "pickup",
        title: `Open shift: ${req.requesterShiftLabel}`,
        subtitle: `${req.requesterShiftDate}`,
        urgency: "low",
        action: onClaim && currentEmpId != null
          ? { label: "Claim", onClick: () => onClaim(req.id, String(currentEmpId)) }
          : undefined,
      });
    }
  }

  // Sort by urgency
  const urgencyOrder = { high: 0, medium: 1, low: 2 };
  items.sort((a, b) => urgencyOrder[a.urgency] - urgencyOrder[b.urgency]);

  return items;
}

export default function ActionQueueCard({ items, maxVisible = 6 }: ActionQueueCardProps) {
  const visible = items.slice(0, maxVisible);

  if (items.length === 0) {
    return (
      <div className="dg-card">
        <div className="dg-card-header">
          <div>
            <div className="dg-card-title">Needs attention</div>
            <div className="dg-card-subtitle">Action items</div>
          </div>
        </div>
        <div className="dg-card-body" style={{ textAlign: "center", padding: "24px 18px" }}>
          <div style={{ fontSize: 12, color: "var(--color-text-subtle)" }}>
            All caught up — nothing requires your attention
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="dg-card">
      <div className="dg-card-header">
        <div>
          <div className="dg-card-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            Needs attention
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                minWidth: 18,
                height: 18,
                borderRadius: 9,
                fontSize: 10,
                fontWeight: 700,
                background: "var(--color-danger)",
                color: "#fff",
                padding: "0 5px",
              }}
            >
              {items.length}
            </span>
          </div>
          <div className="dg-card-subtitle">Items requiring action</div>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column" }}>
        {visible.map((item, i) => {
          const content = (
            <div
              key={item.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 18px",
                borderBottom: i < visible.length - 1 ? "1px solid var(--color-border-light)" : "none",
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
                <div style={{ fontSize: 12, fontWeight: 500, color: "var(--color-text-primary)" }}>
                  {item.title}
                </div>
                <div style={{ fontSize: 10, color: "var(--color-text-subtle)", marginTop: 1 }}>
                  {item.subtitle}
                </div>
              </div>

              {/* Actions */}
              {(item.action || item.secondaryAction) && (
                <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                  {item.action && (
                    <button
                      onClick={item.action.onClick}
                      style={{
                        fontSize: 10,
                        fontWeight: 600,
                        padding: "3px 8px",
                        borderRadius: 5,
                        background: "var(--color-success)",
                        color: "#fff",
                        border: "none",
                        cursor: "pointer",
                      }}
                    >
                      {item.action.label}
                    </button>
                  )}
                  {item.secondaryAction && (
                    <button
                      onClick={item.secondaryAction.onClick}
                      style={{
                        fontSize: 10,
                        fontWeight: 600,
                        padding: "3px 8px",
                        borderRadius: 5,
                        background: "transparent",
                        color: "var(--color-text-subtle)",
                        border: "1px solid var(--color-border)",
                        cursor: "pointer",
                      }}
                    >
                      {item.secondaryAction.label}
                    </button>
                  )}
                </div>
              )}

              {/* Link arrow for href items */}
              {item.href && !item.action && (
                <span style={{ fontSize: 11, color: "var(--color-primary)", fontWeight: 500 }}>&rarr;</span>
              )}
            </div>
          );

          if (item.href && !item.action) {
            return (
              <Link key={item.id} href={item.href} style={{ textDecoration: "none", color: "inherit" }}>
                {content}
              </Link>
            );
          }
          return content;
        })}
      </div>
    </div>
  );
}
