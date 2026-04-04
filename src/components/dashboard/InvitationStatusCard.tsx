import { useState, useEffect } from "react";
import Link from "next/link";
import { fetchInvitations } from "@/lib/db";
import type { Invitation } from "@/types";

interface InvitationStatusCardProps {
  orgId: string;
}

function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const hours = Math.floor(diff / 3600000);
  if (hours < 1) return "just now";
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function InvitationStatusCard({ orgId }: InvitationStatusCardProps) {
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchInvitations(orgId)
      .then((data) => {
        if (!cancelled) setInvitations(data);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [orgId]);

  const pending = invitations.filter(
    (inv) => !inv.acceptedAt && !inv.revokedAt && new Date(inv.expiresAt) > new Date(),
  );
  const recentlyAccepted = invitations.filter(
    (inv) => inv.acceptedAt != null,
  ).slice(0, 3);

  if (loading) {
    return (
      <div className="dg-card">
        <div className="dg-card-header">
          <div>
            <div className="dg-card-title">Invitations</div>
            <div className="dg-card-subtitle">Loading...</div>
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
            Invitations
            {pending.length > 0 && (
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
                  background: "var(--color-warning)",
                  color: "#fff",
                  padding: "0 5px",
                }}
              >
                {pending.length}
              </span>
            )}
          </div>
          <div className="dg-card-subtitle">
            {pending.length} pending &middot; {recentlyAccepted.length} recently accepted
          </div>
        </div>
        <Link
          href="/settings"
          style={{ fontSize: 11, fontWeight: 500, color: "var(--color-primary)", textDecoration: "none" }}
        >
          Manage &rarr;
        </Link>
      </div>
      <div className="dg-card-body" style={{ padding: "4px 18px 14px" }}>
        {pending.length === 0 && recentlyAccepted.length === 0 ? (
          <div style={{ fontSize: 12, color: "var(--color-text-subtle)", textAlign: "center", padding: "16px 0" }}>
            No active invitations
          </div>
        ) : (
          <>
            {/* Pending */}
            {pending.slice(0, 4).map((inv) => (
              <div
                key={inv.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "8px 0",
                  borderBottom: "1px solid var(--color-border-light)",
                }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: "var(--color-warning)",
                    flexShrink: 0,
                  }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 500, color: "var(--color-text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {inv.email}
                  </div>
                  <div style={{ fontSize: 10, color: "var(--color-text-subtle)", marginTop: 1 }}>
                    Sent {formatRelativeTime(inv.createdAt)} &middot; {inv.roleToAssign}
                  </div>
                </div>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    padding: "2px 7px",
                    borderRadius: 4,
                    background: "var(--color-warning-bg)",
                    color: "var(--color-warning)",
                    border: "1px solid var(--color-warning-border)",
                  }}
                >
                  Pending
                </span>
              </div>
            ))}

            {/* Recently accepted */}
            {recentlyAccepted.map((inv) => (
              <div
                key={inv.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "8px 0",
                  borderBottom: "1px solid var(--color-border-light)",
                }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: "var(--color-success)",
                    flexShrink: 0,
                  }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 500, color: "var(--color-text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {inv.email}
                  </div>
                  <div style={{ fontSize: 10, color: "var(--color-text-subtle)", marginTop: 1 }}>
                    Accepted {formatRelativeTime(inv.acceptedAt!)}
                  </div>
                </div>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    padding: "2px 7px",
                    borderRadius: 4,
                    background: "var(--color-success-bg)",
                    color: "var(--color-success-text)",
                    border: "1px solid var(--color-success-border)",
                  }}
                >
                  Accepted
                </span>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
