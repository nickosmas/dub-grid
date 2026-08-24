"use client";

import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchGridmasterImpersonationHistory } from "@/features/gridmaster/client";
import { Button } from "@/components/Button";
import type { ImpersonationHistoryEntry } from "@/types";
import { sectionStyle, thStyle, tdStyle } from "@/lib/styles";
import { EmptyState } from "@/components/EmptyState";
import { MaybeHint } from "@/components/ui/hint";
import { formatClientErrorMessage } from "@/lib/client-facing";
import { queryKeys } from "@/lib/query-keys";

function useNow(intervalMs = 60_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

function StatusBadge({ entry, now }: { entry: ImpersonationHistoryEntry; now: number }) {
  const isEnded = entry.endedAt !== null;
  const isExpired = !isEnded && new Date(entry.expiresAt).getTime() < now;
  const isActive = !isEnded && !isExpired;

  const config = isActive
    ? {
        bg: "var(--color-warning-bg)",
        text: "var(--color-warning)",
        border: "var(--color-warning-border)",
        label: "Active",
      }
    : isEnded
      ? {
          bg: "var(--color-success-bg)",
          text: "var(--color-success)",
          border: "var(--color-success-border)",
          label: "Ended",
        }
      : {
          bg: "var(--color-bg-secondary)",
          text: "var(--color-text-muted)",
          border: "var(--color-border)",
          label: "Expired",
        };

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

function formatDuration(
  startStr: string,
  endStr: string | null,
  expiresStr: string,
  now: number,
): string {
  const start = new Date(startStr).getTime();
  const end = endStr ? new Date(endStr).getTime() : Math.min(now, new Date(expiresStr).getTime());
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
    case "manual":
      return "Manual";
    case "expired":
      return "Expired";
    case "navigation":
      return "Navigation";
    default:
      return reason;
  }
}

export default function ImpersonationHistory() {
  const now = useNow();
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 50;
  const historyQuery = useQuery({
    queryKey: queryKeys.gridmaster.impersonationHistory(page, PAGE_SIZE),
    queryFn: () =>
      fetchGridmasterImpersonationHistory({
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      }),
    staleTime: 30_000,
  });
  const entries = historyQuery.data ?? [];
  const error = historyQuery.error
    ? formatClientErrorMessage(
        historyQuery.error,
        "We couldn't load impersonation history. Refresh and try again.",
      )
    : null;

  return (
    <>
      <h2
        style={{
          margin: "0 0 4px",
          fontSize: "var(--dg-fs-page-title)",
          fontWeight: 700,
          color: "var(--color-text-primary)",
        }}
      >
        Impersonation History
      </h2>
      <p
        style={{
          margin: "0 0 16px",
          fontSize: "var(--dg-fs-label)",
          color: "var(--color-text-muted)",
        }}
      >
        Audit trail of all impersonation sessions.
      </p>

      {error && (
        <div
          style={{
            padding: "12px 16px",
            background: "var(--color-danger-bg)",
            color: "var(--color-danger)",
            borderRadius: "var(--dg-radius-lg)",
            fontSize: "var(--dg-fs-label)",
            fontWeight: 600,
            marginBottom: 16,
          }}
        >
          {error}
        </div>
      )}

      {historyQuery.isLoading ? (
        <div style={sectionStyle}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                gap: 12,
                padding: "12px 14px",
                borderBottom: "1px solid var(--color-border-light)",
              }}
            >
              <div className="dg-skeleton dg-skeleton--text" style={{ width: "8%" }} />
              <div className="dg-skeleton dg-skeleton--text" style={{ width: "16%" }} />
              <div className="dg-skeleton dg-skeleton--text" style={{ width: "14%" }} />
              <div className="dg-skeleton dg-skeleton--text" style={{ width: "14%" }} />
              <div className="dg-skeleton dg-skeleton--text" style={{ width: "18%" }} />
              <div className="dg-skeleton dg-skeleton--text" style={{ width: "12%" }} />
              <div className="dg-skeleton dg-skeleton--text" style={{ width: "12%" }} />
              <div className="dg-skeleton dg-skeleton--text" style={{ width: "6%" }} />
            </div>
          ))}
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
                            <StatusBadge entry={e} now={now} />
                          </td>
                          <td
                            style={{
                              ...tdStyle,
                              fontWeight: 600,
                              fontSize: "var(--dg-fs-caption)",
                            }}
                          >
                            {e.targetEmail}
                          </td>
                          <td
                            style={{
                              ...tdStyle,
                              fontSize: "var(--dg-fs-caption)",
                              color: "var(--color-text-muted)",
                            }}
                          >
                            {e.targetOrgName ?? "—"}
                          </td>
                          <td
                            style={{
                              ...tdStyle,
                              fontSize: "var(--dg-fs-caption)",
                              color: "var(--color-text-muted)",
                            }}
                          >
                            {e.gridmasterEmail}
                          </td>
                          <td
                            style={{
                              ...tdStyle,
                              fontSize: "var(--dg-fs-caption)",
                              color: "var(--color-text-primary)",
                              maxWidth: 200,
                            }}
                          >
                            <MaybeHint content={e.justification} side="bottom">
                              <span
                                style={{
                                  display: "block",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {e.justification || "—"}
                              </span>
                            </MaybeHint>
                          </td>
                          <td
                            style={{
                              ...tdStyle,
                              fontSize: "var(--dg-fs-caption)",
                              color: "var(--color-text-muted)",
                              whiteSpace: "nowrap",
                              fontFamily: "var(--font-dm-mono), monospace",
                            }}
                          >
                            {startDate.toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            })}{" "}
                            {startDate.toLocaleTimeString("en-US", {
                              hour: "numeric",
                              minute: "2-digit",
                            })}
                          </td>
                          <td
                            style={{
                              ...tdStyle,
                              fontSize: "var(--dg-fs-caption)",
                              color: "var(--color-text-muted)",
                              whiteSpace: "nowrap",
                              fontFamily: "var(--font-dm-mono), monospace",
                            }}
                          >
                            {endDate ? (
                              <>
                                {endDate.toLocaleDateString("en-US", {
                                  month: "short",
                                  day: "numeric",
                                  year: "numeric",
                                })}{" "}
                                {endDate.toLocaleTimeString("en-US", {
                                  hour: "numeric",
                                  minute: "2-digit",
                                })}
                              </>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td
                            style={{
                              ...tdStyle,
                              fontSize: "var(--dg-fs-caption)",
                              color: "var(--color-text-muted)",
                              fontFamily: "var(--font-dm-mono, monospace)",
                            }}
                          >
                            {formatDuration(e.createdAt, e.endedAt, e.expiresAt, now)}
                          </td>
                          <td
                            style={{
                              ...tdStyle,
                              fontSize: "var(--dg-fs-caption)",
                              color: "var(--color-text-muted)",
                            }}
                          >
                            {formatReason(e.endReason)}
                          </td>
                          <td
                            style={{
                              ...tdStyle,
                              fontSize: "var(--dg-fs-caption)",
                              color: "var(--color-text-muted)",
                              fontFamily: "var(--font-dm-mono, monospace)",
                            }}
                          >
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
            <EmptyState
              icon={
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
              }
              title="No impersonation sessions yet"
            />
          )}

          {/* Pagination */}
          <div
            style={{
              display: "flex",
              gap: 8,
              justifyContent: "center",
              alignItems: "center",
              marginTop: 16,
            }}
          >
            <Button
              className="dg-btn dg-btn-secondary dg-btn-sm"
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              Previous
            </Button>
            <span
              style={{
                fontSize: "var(--dg-fs-caption)",
                color: "var(--color-text-muted)",
                fontFamily: "var(--font-dm-mono), monospace",
              }}
            >
              {page * PAGE_SIZE + 1}–{page * PAGE_SIZE + entries.length}
            </span>
            <Button
              className="dg-btn dg-btn-secondary dg-btn-sm"
              disabled={entries.length < PAGE_SIZE}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </>
      )}
    </>
  );
}
