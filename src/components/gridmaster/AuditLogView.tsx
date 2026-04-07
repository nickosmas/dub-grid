"use client";

import { useState, useEffect, useMemo } from "react";
import { fetchFullAuditLog } from "@/lib/db";
import type { FullAuditLogEntry } from "@/types";
import { sectionStyle, thStyle, tdStyle } from "@/lib/styles";
import CustomSelect from "@/components/CustomSelect";
import { EmptyState } from "@/components/EmptyState";

const ACTION_LABELS: Record<string, string> = {
  "org.created": "Org Created",
  "org.updated": "Org Updated",
  "org.archived": "Org Archived",
  "org.restored": "Org Restored",
  "org.suspended": "Org Suspended",
  "org.unsuspended": "Org Unsuspended",
  "org.deleted": "Org Deleted",
  "role.changed": "Role Changed",
  "permissions.updated": "Perms Updated",
  "user.removed_from_org": "User Removed",
  "user.deactivated": "User Deactivated",
  "user.reactivated": "User Reactivated",
  "user.force_logout": "Force Logout",
  "user.password_reset_sent": "Password Reset",
  "impersonation.started": "Impersonation Start",
  "impersonation.ended": "Impersonation End",
  "invitation.sent": "Invitation Sent",
  "invitation.accepted": "Invitation Accepted",
  "invitation.revoked": "Invitation Revoked",
  "invitation.resent": "Invitation Resent",
  "employee.created": "Employee Created",
  "employee.updated": "Employee Updated",
  "employee.benched": "Employee Benched",
  "employee.activated": "Employee Activated",
  "employee.terminated": "Employee Terminated",
  "shift.created": "Shift Created",
  "shift.updated": "Shift Updated",
  "shift.deleted": "Shift Deleted",
  "schedule.published": "Schedule Published",
  "schedule.discarded": "Drafts Discarded",
  "billing.trial_extended": "Trial Extended",
  "billing.subscription_canceled": "Subscription Canceled",
  "billing.synced": "Billing Synced",
};

function getActionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action.replace(/\./g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function ActionBadge({ action }: { action: string }) {
  const isDestructive = action.includes("deleted") || action.includes("removed") || action.includes("suspended") || action.includes("deactivated") || action.includes("terminated") || action.includes("revoked") || action.includes("force_logout");
  const isCreate = action.includes("created") || action.includes("restored") || action.includes("activated") || action.includes("accepted") || action.includes("unsuspended") || action.includes("reactivated");
  const isImpersonation = action.includes("impersonation");

  const bg = isDestructive
    ? "var(--color-danger-bg)"
    : isCreate
      ? "var(--color-success-bg, #e6f9e6)"
      : isImpersonation
        ? "var(--color-warning-bg, #fff8e6)"
        : "var(--color-bg-secondary)";
  const color = isDestructive
    ? "var(--color-danger)"
    : isCreate
      ? "var(--color-success, #1a8a1a)"
      : isImpersonation
        ? "var(--color-warning, #b08800)"
        : "var(--color-text-secondary)";

  return (
    <span
      style={{
        display: "inline-block",
        fontSize: "var(--dg-fs-footnote)",
        fontWeight: 600,
        padding: "2px 8px",
        borderRadius: 4,
        background: bg,
        color,
        whiteSpace: "nowrap",
      }}
    >
      {getActionLabel(action)}
    </span>
  );
}

function DetailsSummary({ details, action }: { details: Record<string, unknown>; action: string }) {
  if (!details || Object.keys(details).length === 0) return <span style={{ color: "var(--color-text-faint)" }}>—</span>;

  const parts: string[] = [];
  if (action === "role.changed" && details.from_role && details.to_role) {
    parts.push(`${details.from_role} → ${details.to_role}`);
  } else if (action === "org.suspended" && details.reason) {
    parts.push(`Reason: ${details.reason}`);
  } else if (details.name) {
    parts.push(String(details.name));
  } else if (details.email) {
    parts.push(String(details.email));
  } else if (details.justification) {
    parts.push(String(details.justification));
  }

  if (parts.length === 0) {
    const keys = Object.keys(details).slice(0, 2);
    for (const k of keys) parts.push(`${k}: ${String(details[k])}`);
  }

  return (
    <span
      style={{ fontSize: "var(--dg-fs-footnote)", color: "var(--color-text-muted)", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "inline-block" }}
      title={JSON.stringify(details, null, 2)}
    >
      {parts.join("; ")}
    </span>
  );
}

// Available action categories for filtering
const ACTION_CATEGORIES = [
  { value: "all", label: "All Actions" },
  { value: "org.", label: "Organization" },
  { value: "role.", label: "Roles & Permissions" },
  { value: "user.", label: "User Management" },
  { value: "impersonation.", label: "Impersonation" },
  { value: "invitation.", label: "Invitations" },
  { value: "employee.", label: "Employees" },
  { value: "shift.", label: "Shifts" },
  { value: "schedule.", label: "Schedule" },
  { value: "billing.", label: "Billing" },
];

export default function AuditLogView({
  orgId,
  title,
}: {
  orgId?: string;
  title?: string;
}) {
  const [entries, setEntries] = useState<FullAuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [actionFilter, setActionFilter] = useState("all");
  const PAGE_SIZE = 50;

  useEffect(() => {
    let cancelled = false;

    fetchFullAuditLog({
      orgId,
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    })
      .then((data) => { if (!cancelled) setEntries(data); })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [orgId, page]);

  const filteredEntries = useMemo(() => {
    if (actionFilter === "all") return entries;
    return entries.filter((e) => e.action.startsWith(actionFilter));
  }, [entries, actionFilter]);

  const actionOptions = useMemo(() => ACTION_CATEGORIES, []);

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
        <h2 style={{ margin: 0, fontSize: "var(--dg-fs-heading)", fontWeight: 700, color: "var(--color-text-primary)" }}>
          {title ?? "Audit Log"}
        </h2>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <CustomSelect
            value={actionFilter}
            options={actionOptions}
            onChange={(v) => { setActionFilter(v); setPage(0); }}
            style={{ width: "auto", minWidth: 160 }}
            fontSize={12}
          />
        </div>
      </div>

      {error && (
        <div style={{ padding: "12px 16px", background: "var(--color-danger-bg)", color: "var(--color-danger)", borderRadius: 10, fontSize: "var(--dg-fs-label)", fontWeight: 600, marginBottom: 16 }}>
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ padding: 32, textAlign: "center", color: "var(--color-text-muted)", fontSize: "var(--dg-fs-label)" }}>
          Loading…
        </div>
      ) : (
        <>
          {filteredEntries.length > 0 ? (
            <div style={sectionStyle}>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={{ ...thStyle, background: "var(--color-bg-secondary)" }}>Timestamp</th>
                      <th style={{ ...thStyle, background: "var(--color-bg-secondary)" }}>Action</th>
                      <th style={{ ...thStyle, background: "var(--color-bg-secondary)" }}>Actor</th>
                      <th style={{ ...thStyle, background: "var(--color-bg-secondary)" }}>Resource</th>
                      <th style={{ ...thStyle, background: "var(--color-bg-secondary)" }}>Details</th>
                      {!orgId && <th style={{ ...thStyle, background: "var(--color-bg-secondary)" }}>Org</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredEntries.map((e, idx) => {
                      const date = new Date(e.createdAt);
                      return (
                        <tr key={e.id} style={{ background: idx % 2 === 1 ? "var(--color-row-alt)" : undefined }}>
                          <td style={{ ...tdStyle, fontSize: "var(--dg-fs-caption)", color: "var(--color-text-muted)", whiteSpace: "nowrap", fontFamily: "var(--font-dm-mono), monospace" }}>
                            {date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                            {" "}
                            {date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                          </td>
                          <td style={tdStyle}>
                            <ActionBadge action={e.action} />
                          </td>
                          <td style={{ ...tdStyle, fontSize: "var(--dg-fs-caption)", color: "var(--color-text-muted)", fontFamily: "var(--font-dm-mono), monospace" }}>
                            {e.actorEmail ?? (e.actorId ? e.actorId.slice(0, 8) + "…" : "System")}
                          </td>
                          <td style={{ ...tdStyle, fontSize: "var(--dg-fs-caption)", color: "var(--color-text-muted)", fontFamily: "var(--font-dm-mono), monospace" }}>
                            {e.resourceType}
                            {e.resourceId ? ` #${e.resourceId.slice(0, 8)}` : ""}
                          </td>
                          <td style={tdStyle}>
                            <DetailsSummary details={e.details} action={e.action} />
                          </td>
                          {!orgId && (
                            <td style={{ ...tdStyle, fontSize: "var(--dg-fs-caption)", color: "var(--color-text-muted)" }}>
                              {e.orgId ? e.orgId.slice(0, 8) + "…" : "—"}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <EmptyState
              icon={
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
              }
              title="No audit log entries"
              description={actionFilter !== "all" ? "Try changing the action filter to see more entries." : undefined}
            />
          )}

          {/* Pagination */}
          <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 16 }}>
            <button
              className="dg-btn dg-btn-secondary"
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              style={{ fontSize: "var(--dg-fs-caption)", padding: "6px 12px" }}
            >
              Previous
            </button>
            <span style={{ fontSize: "var(--dg-fs-caption)", color: "var(--color-text-muted)", display: "flex", alignItems: "center" }}>
              Page {page + 1}
            </span>
            <button
              className="dg-btn dg-btn-secondary"
              disabled={entries.length < PAGE_SIZE}
              onClick={() => setPage((p) => p + 1)}
              style={{ fontSize: "var(--dg-fs-caption)", padding: "6px 12px" }}
            >
              Next
            </button>
          </div>
        </>
      )}
    </>
  );
}
