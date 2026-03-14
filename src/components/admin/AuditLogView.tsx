"use client";

import { useState, useEffect } from "react";
import { fetchAuditLog } from "@/lib/db";
import type { AuditLogEntry } from "@/types";

const sectionStyle: React.CSSProperties = {
  background: "#fff",
  borderRadius: 12,
  border: "1px solid var(--color-border)",
  overflow: "hidden",
  boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
};

const thStyle: React.CSSProperties = {
  padding: "10px 14px",
  fontSize: 11,
  fontWeight: 700,
  color: "var(--color-text-subtle)",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  textAlign: "left",
  whiteSpace: "nowrap",
};

const tdStyle: React.CSSProperties = {
  padding: "10px 14px",
  fontSize: 13,
  color: "var(--color-text-primary)",
  borderTop: "1px solid var(--color-border-light)",
};

const roleBadgeColors: Record<string, { bg: string; text: string }> = {
  super_admin: { bg: "#FEF3C7", text: "#92400E" },
  admin: { bg: "#DBEAFE", text: "#1E40AF" },
  user: { bg: "var(--color-surface-overlay)", text: "var(--color-text-muted)" },
  gridmaster: { bg: "#F3E8FF", text: "#6B21A8" },
};

function RoleBadge({ role }: { role: string }) {
  const c = roleBadgeColors[role] ?? roleBadgeColors.user;
  return (
    <span
      style={{
        display: "inline-block",
        fontSize: 11,
        fontWeight: 600,
        padding: "2px 8px",
        borderRadius: 4,
        background: c.bg,
        color: c.text,
        textTransform: "uppercase",
        letterSpacing: "0.03em",
      }}
    >
      {role.replace("_", " ")}
    </span>
  );
}

export default function AuditLogView({
  orgId,
  title,
}: {
  orgId?: string;
  title?: string;
}) {
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 50;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchAuditLog({ orgId, limit: PAGE_SIZE, offset: page * PAGE_SIZE })
      .then((data) => { if (!cancelled) setEntries(data); })
      .catch((err) => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [orgId, page]);

  return (
    <>
      <h2 style={{ margin: "0 0 16px", fontSize: 18, fontWeight: 700, color: "var(--color-text-primary)" }}>
        {title ?? "Audit Log"}
      </h2>

      {error && (
        <div style={{ padding: "12px 16px", background: "var(--color-danger-bg)", color: "var(--color-danger)", borderRadius: 10, fontSize: 13, fontWeight: 600, marginBottom: 16 }}>
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ padding: 32, textAlign: "center", color: "var(--color-text-muted)", fontSize: 13 }}>
          Loading…
        </div>
      ) : (
        <>
          {/* Table & Empty State */}
          {entries.length > 0 ? (
            <div style={sectionStyle}>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={thStyle}>Timestamp</th>
                      <th style={thStyle}>Target User</th>
                      <th style={thStyle}>Change</th>
                      <th style={thStyle}>Changed By</th>
                      {!orgId && <th style={thStyle}>Organization</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((e) => {
                      const date = new Date(e.createdAt);
                      return (
                        <tr key={e.id}>
                          <td style={{ ...tdStyle, fontSize: 12, color: "var(--color-text-muted)", whiteSpace: "nowrap" }}>
                            {date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                            {" "}
                            {date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                          </td>
                          <td style={{ ...tdStyle, fontWeight: 600, fontSize: 12 }}>
                            {e.targetEmail ?? e.targetUserId.slice(0, 8) + "…"}
                          </td>
                          <td style={tdStyle}>
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                              <RoleBadge role={e.fromRole} />
                              <span style={{ color: "var(--color-text-muted)", fontSize: 12 }}>→</span>
                              <RoleBadge role={e.toRole} />
                            </span>
                          </td>
                          <td style={{ ...tdStyle, fontSize: 12, color: "var(--color-text-muted)" }}>
                            {e.changedByEmail ?? e.changedById.slice(0, 8) + "…"}
                          </td>
                          {!orgId && (
                            <td style={{ ...tdStyle, fontSize: 12, color: "var(--color-text-muted)" }}>
                              {e.orgName ?? "—"}
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
            <div
              style={{
                padding: "48px 20px",
                textAlign: "center",
                background: "#fff",
                borderRadius: 12,
                border: "1px dashed var(--color-border)",
                color: "var(--color-text-muted)",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 12,
              }}
            >
              <div style={{ color: "var(--color-text-faint)", background: "#F8FAFC", padding: "12px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
              </div>
              <div style={{ fontSize: 16, fontWeight: 600 }}>
                No audit log entries
              </div>
            </div>
          )}

          {/* Pagination */}
          <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 16 }}>
            <button
              className="dg-btn dg-btn-secondary"
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              style={{ fontSize: 12, padding: "6px 12px" }}
            >
              Previous
            </button>
            <span style={{ fontSize: 12, color: "var(--color-text-muted)", display: "flex", alignItems: "center" }}>
              Page {page + 1}
            </span>
            <button
              className="dg-btn dg-btn-secondary"
              disabled={entries.length < PAGE_SIZE}
              onClick={() => setPage((p) => p + 1)}
              style={{ fontSize: 12, padding: "6px 12px" }}
            >
              Next
            </button>
          </div>
        </>
      )}
    </>
  );
}
