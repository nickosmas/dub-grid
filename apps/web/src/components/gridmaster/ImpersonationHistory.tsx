"use client";
import { Clock } from "lucide-react";

import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchGridmasterImpersonationHistory } from "@/features/gridmaster/client";
import { Pagination } from "@/components/ui/pagination";
import type { ImpersonationHistoryEntry } from "@/types";
import { sectionStyle } from "@/lib/styles";
import { EmptyState } from "@/components/EmptyState";
import { MaybeHint } from "@/components/ui/hint";
import { formatClientErrorMessage } from "@/lib/client-facing";
import { queryKeys } from "@/lib/query-keys";
import {
  gmHeaderStyle,
  gmTableStyle,
  gmTdStyle,
  gmThStyle,
} from "@/components/gridmaster/table-styles";

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
        bg: "var(--dg-color-warning-bg)",
        text: "var(--dg-color-warning)",
        border: "var(--dg-color-warning-border)",
        label: "Active",
      }
    : isEnded
      ? {
          bg: "var(--dg-color-success-bg)",
          text: "var(--dg-color-success)",
          border: "var(--dg-color-success-border)",
          label: "Ended",
        }
      : {
          bg: "var(--dg-color-bg-secondary)",
          text: "var(--dg-color-text-muted)",
          border: "var(--dg-color-border)",
          label: "Expired",
        };

  return (
    <span
      style={{
        display: "inline-block",
        fontSize: "var(--dg-fs-footnote)",
        fontWeight: 600,
        padding: "2px 8px",
        borderRadius: "var(--dg-radius-xs)",
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
          fontSize: "var(--dg-type-page-title-size)",
          fontWeight: 700,
          color: "var(--dg-color-text-primary)",
        }}
      >
        Impersonation History
      </h2>
      <p
        style={{
          margin: "0 0 16px",
          fontSize: "var(--dg-fs-label)",
          color: "var(--dg-color-text-muted)",
        }}
      >
        Audit trail of all impersonation sessions.
      </p>

      {error && (
        <div
          style={{
            padding: "12px 16px",
            background: "var(--dg-color-danger-bg)",
            color: "var(--dg-color-danger)",
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
                borderBottom: "1px solid var(--dg-color-border-light)",
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
                <table style={gmTableStyle}>
                  <thead>
                    <tr>
                      <th style={gmHeaderStyle("Status")}>Status</th>
                      <th style={gmHeaderStyle("Target user")}>Target user</th>
                      <th style={gmHeaderStyle("Organization")}>Organization</th>
                      <th style={gmHeaderStyle("Gridmaster")}>Gridmaster</th>
                      <th style={gmHeaderStyle("Justification")}>Justification</th>
                      <th style={gmHeaderStyle("Started")}>Started</th>
                      <th style={gmHeaderStyle("Ended")}>Ended</th>
                      <th style={gmHeaderStyle("Duration")}>Duration</th>
                      <th style={gmHeaderStyle("End reason")}>End reason</th>
                      <th style={gmHeaderStyle("IP address")}>IP address</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((e) => {
                      const startDate = new Date(e.createdAt);
                      const endDate = e.endedAt ? new Date(e.endedAt) : null;
                      return (
                        <tr key={e.sessionId}>
                          <td style={gmTdStyle}>
                            <StatusBadge entry={e} now={now} />
                          </td>
                          <td
                            style={{
                              ...gmTdStyle,
                              fontWeight: 600,
                              fontSize: "var(--dg-fs-caption)",
                            }}
                          >
                            {e.targetEmail}
                          </td>
                          <td
                            style={{
                              ...gmTdStyle,
                              fontSize: "var(--dg-fs-caption)",
                              color: "var(--dg-color-text-muted)",
                            }}
                          >
                            {e.targetOrgName ?? "—"}
                          </td>
                          <td
                            style={{
                              ...gmTdStyle,
                              fontSize: "var(--dg-fs-caption)",
                              color: "var(--dg-color-text-muted)",
                            }}
                          >
                            {e.gridmasterEmail}
                          </td>
                          <td
                            style={{
                              ...gmTdStyle,
                              fontSize: "var(--dg-fs-caption)",
                              color: "var(--dg-color-text-primary)",
                            }}
                          >
                            <MaybeHint content={e.justification} side="bottom">
                              <span style={{ display: "block" }}>{e.justification || "—"}</span>
                            </MaybeHint>
                          </td>
                          <td
                            style={{
                              ...gmTdStyle,
                              fontSize: "var(--dg-fs-caption)",
                              color: "var(--dg-color-text-muted)",
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
                              ...gmTdStyle,
                              fontSize: "var(--dg-fs-caption)",
                              color: "var(--dg-color-text-muted)",
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
                              ...gmTdStyle,
                              fontSize: "var(--dg-fs-caption)",
                              color: "var(--dg-color-text-muted)",
                              fontFamily: "var(--font-dm-mono, monospace)",
                            }}
                          >
                            {formatDuration(e.createdAt, e.endedAt, e.expiresAt, now)}
                          </td>
                          <td
                            style={{
                              ...gmTdStyle,
                              fontSize: "var(--dg-fs-caption)",
                              color: "var(--dg-color-text-muted)",
                            }}
                          >
                            {formatReason(e.endReason)}
                          </td>
                          <td
                            style={{
                              ...gmTdStyle,
                              fontSize: "var(--dg-fs-caption)",
                              color: "var(--dg-color-text-muted)",
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
            <EmptyState icon={<Clock size={24} />} title="No impersonation sessions yet" />
          )}

          {/* Pagination */}
          <Pagination
            page={page + 1}
            hasNext={entries.length >= PAGE_SIZE}
            onPageChange={(next) => setPage(next - 1)}
            summary={`Showing ${page * PAGE_SIZE + 1}–${page * PAGE_SIZE + entries.length}`}
            className="mt-4"
          />
        </>
      )}
    </>
  );
}
