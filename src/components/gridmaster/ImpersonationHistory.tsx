"use client";

import { useState, useEffect } from "react";
import { fetchImpersonationHistory } from "@/lib/db";
import type { ImpersonationHistoryEntry } from "@/types";
import { sectionStyle, thStyle, tdStyle } from "@/lib/styles";

function StatusBadge({ entry }: { entry: ImpersonationHistoryEntry }) {
  const now = Date.now();
  const isEnded = entry.endedAt !== null;
  const isExpired = !isEnded && new Date(entry.expiresAt).getTime() < now;
  const isActive = !isEnded && !isExpired;

  const config = isActive
    ? { bg: "#FFFBEB", text: "#B45309", border: "#FDE68A", label: "Active" }
    : isEnded
      ? { bg: "#F0FDF4", text: "#15803D", border: "#BBF7D0", label: "Ended" }
      : { bg: "#F1F5F9", text: "#64748B", border: "#CBD5E1", label: "Expired" };

  return (
    <span
      style={{
        display: "inline-block",
        fontSize: "var(--dg-fs-footnote)",
        fontWeight: 600,
        padding: "2px 8px",
        borderRadius: 4,
        background: config.bg,
        color: config.text,
        border: `1px solid ${config.border}`,
        textTransform: "uppercase",
        letterSpacing: "0.03em",
      }}
    >
      {config.label}
    </span>
  );
}

function formatDuration(startStr: string, endStr: string | null, expiresStr: string): string {
  const start = new Date(startStr).getTime();
  const end = endStr
    ? new Date(endStr).getTime()
    : Math.min(Date.now(), new Date(expiresStr).getTime());
  const diffMs = Math.max(0, end - start);
  const mins = Math.floor(diffMs / 60000);
  const secs = Math.floor((diffMs % 60000) / 1000);
  if (mins >= 60) {
    const hrs = Math.floor(mins / 60);
    return `${hrs}h ${mins % 60}m`;
  }
  return `${mins}m ${secs}s`;
}

function formatReason(reason: string | null): string {
  if (!reason) return "—";
  switch (reason) {
    case "manual": return "Manual";
    case "expired": return "Expired";
    case "navigation": return "Navigation";
    default: return reason;
  }
}

export default function ImpersonationHistory() {
  const [entries, setEntries] = useState<ImpersonationHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 50;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchImpersonationHistory({ limit: PAGE_SIZE, offset: page * PAGE_SIZE })
      .then((data) => { if (!cancelled) setEntries(data); })
      .catch((err) => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [page]);

  return (
    <>
      <h2 style={{ margin: "0 0 4px", fontSize: "var(--dg-fs-heading)", fontWeight: 700, color: "var(--color-text-primary)" }}>
        Impersonation History
      </h2>
      <p style={{ margin: "0 0 16px", fontSize: "var(--dg-fs-label)", color: "var(--color-text-muted)" }}>
        Audit trail of all impersonation sessions.
      </p>

      {error && (
        <div style={{ padding: "12px 16px", background: "var(--color-danger-bg)", color: "var(--color-danger)", borderRadius: 10, fontSize: "var(--dg-fs-label)", fontWeight: 600, marginBottom: 16 }}>
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ padding: 32, textAlign: "center", color: "var(--color-text-muted)", fontSize: "var(--dg-fs-label)" }}>
          Loading...
        </div>
      ) : (
        <>
          {entries.length > 0 ? (
            <div style={sectionStyle}>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={thStyle}>Status</th>
                      <th style={thStyle}>Target User</th>
                      <th style={thStyle}>Organization</th>
                      <th style={thStyle}>Gridmaster</th>
                      <th style={thStyle}>Justification</th>
                      <th style={thStyle}>Started</th>
                      <th style={thStyle}>Ended</th>
                      <th style={thStyle}>Duration</th>
                      <th style={thStyle}>End Reason</th>
                      <th style={thStyle}>IP Address</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((e) => {
                      const startDate = new Date(e.createdAt);
                      const endDate = e.endedAt ? new Date(e.endedAt) : null;
                      return (
                        <tr key={e.sessionId}>
                          <td style={tdStyle}>
                            <StatusBadge entry={e} />
                          </td>
                          <td style={{ ...tdStyle, fontWeight: 600, fontSize: "var(--dg-fs-caption)" }}>
                            {e.targetEmail}
                          </td>
                          <td style={{ ...tdStyle, fontSize: "var(--dg-fs-caption)", color: "var(--color-text-muted)" }}>
                            {e.targetOrgName ?? "—"}
                          </td>
                          <td style={{ ...tdStyle, fontSize: "var(--dg-fs-caption)", color: "var(--color-text-muted)" }}>
                            {e.gridmasterEmail}
                          </td>
                          <td style={{ ...tdStyle, fontSize: "var(--dg-fs-caption)", color: "var(--color-text-primary)", maxWidth: 200 }}>
                            <span
                              style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                              title={e.justification || undefined}
                            >
                              {e.justification || "—"}
                            </span>
                          </td>
                          <td style={{ ...tdStyle, fontSize: "var(--dg-fs-caption)", color: "var(--color-text-muted)", whiteSpace: "nowrap" }}>
                            {startDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                            {" "}
                            {startDate.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                          </td>
                          <td style={{ ...tdStyle, fontSize: "var(--dg-fs-caption)", color: "var(--color-text-muted)", whiteSpace: "nowrap" }}>
                            {endDate
                              ? <>
                                  {endDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                                  {" "}
                                  {endDate.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                                </>
                              : "—"
                            }
                          </td>
                          <td style={{ ...tdStyle, fontSize: "var(--dg-fs-caption)", color: "var(--color-text-muted)", fontFamily: "var(--font-dm-mono, monospace)" }}>
                            {formatDuration(e.createdAt, e.endedAt, e.expiresAt)}
                          </td>
                          <td style={{ ...tdStyle, fontSize: "var(--dg-fs-caption)", color: "var(--color-text-muted)" }}>
                            {formatReason(e.endReason)}
                          </td>
                          <td style={{ ...tdStyle, fontSize: "var(--dg-fs-caption)", color: "var(--color-text-muted)", fontFamily: "var(--font-dm-mono, monospace)" }}>
                            {e.ipAddress ?? "—"}
                          </td>
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
                background: "var(--color-surface)",
                borderRadius: 12,
                border: "1px dashed var(--color-border)",
                color: "var(--color-text-muted)",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 12,
              }}
            >
              <div style={{ color: "var(--color-text-faint)", background: "var(--color-bg)", padding: 12, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
              </div>
              <div style={{ fontSize: "var(--dg-fs-title)", fontWeight: 600 }}>
                No impersonation sessions yet
              </div>
            </div>
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
