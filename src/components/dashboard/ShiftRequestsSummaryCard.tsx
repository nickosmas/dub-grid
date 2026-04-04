import type { ShiftRequest } from "@/types";

interface ShiftRequestsSummaryCardProps {
  isAdmin: boolean;
  openPickups: ShiftRequest[];
  myRequests: ShiftRequest[];
  pendingApproval: ShiftRequest[];
  currentEmpId: string | null;
  onClaim?: (requestId: string, empId: string) => Promise<boolean>;
  onRespond?: (requestId: string, empId: string, accept: boolean) => Promise<boolean>;
  onResolve?: (requestId: string, approved: boolean, note?: string) => Promise<boolean>;
  onCancel?: (requestId: string, empId: string) => Promise<boolean>;
}

const STATUS_STYLES: Record<string, { bg: string; color: string; border: string }> = {
  open: { bg: "var(--color-success-bg)", color: "var(--color-success-text)", border: "var(--color-success-border)" },
  pending_approval: { bg: "var(--color-warning-bg)", color: "var(--color-warning)", border: "var(--color-warning-border)" },
  approved: { bg: "var(--color-success-bg)", color: "var(--color-success-text)", border: "var(--color-success-border)" },
  rejected: { bg: "var(--color-danger-bg)", color: "var(--color-danger)", border: "var(--color-danger-border)" },
  cancelled: { bg: "var(--color-bg-secondary)", color: "var(--color-text-subtle)", border: "var(--color-border)" },
  expired: { bg: "var(--color-bg-secondary)", color: "var(--color-text-subtle)", border: "var(--color-border)" },
};

const TYPE_LABELS: Record<string, string> = {
  pickup: "Pickup",
  swap: "Swap",
  calloff: "Call-off",
};

function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const hours = Math.floor(diff / 3600000);
  if (hours < 1) return "just now";
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function RequestRow({
  request,
  actions,
}: {
  request: ShiftRequest;
  actions?: React.ReactNode;
}) {
  const statusStyle = STATUS_STYLES[request.status] ?? STATUS_STYLES.open;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "9px 0",
        borderBottom: "1px solid var(--color-border-light)",
      }}
    >
      {/* Type badge */}
      <span
        style={{
          fontSize: 10,
          fontWeight: 600,
          padding: "2px 7px",
          borderRadius: 4,
          background: "var(--color-bg-secondary)",
          color: "var(--color-text-secondary)",
          whiteSpace: "nowrap",
        }}
      >
        {TYPE_LABELS[request.type] ?? request.type}
      </span>

      {/* Details */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 500, color: "var(--color-text-primary)" }}>
          {request.requesterName}
          {request.type === "swap" && request.targetName && (
            <span style={{ color: "var(--color-text-subtle)" }}> &harr; {request.targetName}</span>
          )}
        </div>
        <div style={{ fontSize: 10, color: "var(--color-text-subtle)", marginTop: 1 }}>
          {request.requesterShiftLabel} &middot; {request.requesterShiftDate}
          {" \u00B7 "}
          {formatRelativeTime(request.createdAt)}
        </div>
      </div>

      {/* Status badge */}
      <span
        style={{
          fontSize: 10,
          fontWeight: 600,
          padding: "2px 7px",
          borderRadius: 4,
          background: statusStyle.bg,
          color: statusStyle.color,
          border: `1px solid ${statusStyle.border}`,
          whiteSpace: "nowrap",
        }}
      >
        {request.status.replace("_", " ")}
      </span>

      {/* Actions */}
      {actions}
    </div>
  );
}

function ActionButton({
  label,
  variant,
  onClick,
}: {
  label: string;
  variant: "approve" | "reject" | "cancel";
  onClick: () => void;
}) {
  const styles = {
    approve: { bg: "var(--color-success)", color: "#fff" },
    reject: { bg: "transparent", color: "var(--color-danger)" },
    cancel: { bg: "transparent", color: "var(--color-text-subtle)" },
  };
  const s = styles[variant];

  return (
    <button
      onClick={onClick}
      style={{
        fontSize: 10,
        fontWeight: 600,
        padding: "3px 8px",
        borderRadius: 5,
        background: s.bg,
        color: s.color,
        border: variant === "approve" ? "none" : "1px solid var(--color-border)",
        cursor: "pointer",
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </button>
  );
}

export default function ShiftRequestsSummaryCard({
  isAdmin,
  openPickups,
  myRequests,
  pendingApproval,
  currentEmpId,
  onClaim,
  onRespond,
  onResolve,
  onCancel,
}: ShiftRequestsSummaryCardProps) {
  if (isAdmin) {
    // Admin view: Approval queue
    return (
      <div className="dg-card">
        <div className="dg-card-header">
          <div>
            <div className="dg-card-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
              Approval queue
              {pendingApproval.length > 0 && (
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
                  {pendingApproval.length}
                </span>
              )}
            </div>
            <div className="dg-card-subtitle">Shift requests awaiting review</div>
          </div>
        </div>
        <div className="dg-card-body" style={{ padding: "4px 18px 14px" }}>
          {pendingApproval.length === 0 ? (
            <div style={{ fontSize: 12, color: "var(--color-text-subtle)", textAlign: "center", padding: "16px 0" }}>
              No pending requests
            </div>
          ) : (
            pendingApproval.slice(0, 5).map((req) => (
              <RequestRow
                key={req.id}
                request={req}
                actions={
                  onResolve && (
                    <div style={{ display: "flex", gap: 4 }}>
                      <ActionButton label="Approve" variant="approve" onClick={() => onResolve(req.id, true)} />
                      <ActionButton label="Reject" variant="reject" onClick={() => onResolve(req.id, false)} />
                    </div>
                  )
                }
              />
            ))
          )}
        </div>
      </div>
    );
  }

  // User view: My requests + open pickups
  const swapProposals = myRequests.filter(
    (r) => r.type === "swap" && r.targetEmpId === String(currentEmpId) && r.status === "open",
  );

  return (
    <div className="dg-card">
      <div className="dg-card-header">
        <div>
          <div className="dg-card-title">Shift requests</div>
          <div className="dg-card-subtitle">
            {myRequests.length} active &middot; {openPickups.length} available
          </div>
        </div>
      </div>
      <div className="dg-card-body" style={{ padding: "4px 18px 14px" }}>
        {/* Swap proposals directed at me */}
        {swapProposals.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--color-warning)", marginBottom: 4 }}>
              Swap proposals for you
            </div>
            {swapProposals.map((req) => (
              <RequestRow
                key={req.id}
                request={req}
                actions={
                  onRespond && currentEmpId != null && (
                    <div style={{ display: "flex", gap: 4 }}>
                      <ActionButton label="Accept" variant="approve" onClick={() => onRespond(req.id, String(currentEmpId), true)} />
                      <ActionButton label="Decline" variant="reject" onClick={() => onRespond(req.id, String(currentEmpId), false)} />
                    </div>
                  )
                }
              />
            ))}
          </div>
        )}

        {/* My requests */}
        {myRequests.length > 0 ? (
          <div style={{ marginBottom: openPickups.length > 0 ? 12 : 0 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--color-text-secondary)", marginBottom: 4 }}>
              My requests
            </div>
            {myRequests
              .filter((r) => !(r.type === "swap" && r.targetEmpId === String(currentEmpId)))
              .slice(0, 4)
              .map((req) => (
                <RequestRow
                  key={req.id}
                  request={req}
                  actions={
                    req.status === "open" && onCancel && currentEmpId != null ? (
                      <ActionButton label="Cancel" variant="cancel" onClick={() => onCancel(req.id, String(currentEmpId))} />
                    ) : undefined
                  }
                />
              ))}
          </div>
        ) : (
          <div style={{ fontSize: 12, color: "var(--color-text-subtle)", textAlign: "center", padding: "12px 0" }}>
            You have no active requests
          </div>
        )}

        {/* Available pickups */}
        {openPickups.length > 0 && (
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--color-text-secondary)", marginBottom: 4 }}>
              Available shifts ({openPickups.length})
            </div>
            {openPickups.slice(0, 3).map((req) => (
              <RequestRow
                key={req.id}
                request={req}
                actions={
                  onClaim && currentEmpId != null ? (
                    <ActionButton label="Claim" variant="approve" onClick={() => onClaim(req.id, String(currentEmpId))} />
                  ) : undefined
                }
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
