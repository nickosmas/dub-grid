"use client";

import React, { useState, useEffect, useMemo } from "react";
import { fetchGridmasterFullAuditLog } from "@/features/gridmaster/client";
import type { FullAuditLogEntry } from "@/types";
import CustomSelect from "@/components/CustomSelect";
import { CloseButton } from "@/components/ui/CloseButton";
import { useMediaQuery, MOBILE } from "@/hooks";
import {
  ACTIVITY_CATEGORIES,
  matchesCategory,
  matchesSearch,
  describeAction,
  getActionSeverity,
  severityColor,
  formatRelativeTime,
  formatDetails,
  groupByDate,
  getAuditActorLabel,
  getAuditActorSecondaryLabel,
  getAuditTargetLabel,
} from "@/lib/activity-log-utils";
import type { DetailItem } from "@/lib/activity-log-utils";
import { formatClientErrorMessage } from "@/lib/client-facing";
import { EmptyState } from "@/components/EmptyState";

const PAGE_SIZE = 50;

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

const SEARCH_ICON = (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);

// ---------------------------------------------------------------------------
// Shared styles
// ---------------------------------------------------------------------------

const TH_STYLE: React.CSSProperties = {
  textAlign: "left",
  padding: "8px 12px",
  fontWeight: 600,
  color: "var(--color-text-muted)",
  fontSize: "var(--dg-fs-footnote)",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  whiteSpace: "nowrap",
  borderBottom: "1px solid var(--color-border)",
};

const TD_STYLE: React.CSSProperties = {
  padding: "10px 12px",
  fontSize: "var(--dg-fs-body-sm)",
  verticalAlign: "top",
  borderBottom: "1px solid var(--color-border-light)",
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function Toolbar({
  searchQuery,
  onSearchChange,
  categoryFilter,
  onCategoryChange,
  isMobile,
}: {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  categoryFilter: string;
  onCategoryChange: (v: string) => void;
  isMobile: boolean;
}) {
  const selectOptions = ACTIVITY_CATEGORIES.map((c) => ({
    value: c.value,
    label: c.label,
  }));

  return (
    <div
      style={{
        display: "flex",
        flexDirection: isMobile ? "column" : "row",
        gap: 10,
        marginBottom: 16,
      }}
    >
      <div style={{ position: "relative", flex: 1 }}>
        <span
          style={{
            position: "absolute",
            left: 10,
            top: "50%",
            transform: "translateY(-50%)",
            color: "var(--color-text-faint)",
            display: "flex",
            pointerEvents: "none",
          }}
        >
          {SEARCH_ICON}
        </span>
        <input
          type="text"
          placeholder="Search activity..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          style={{
            width: "100%",
            padding: `7px ${searchQuery ? 30 : 12}px 7px 32px`,
            borderRadius: "var(--dg-radius-md, 8px)",
            border: "1px solid var(--color-border)",
            background: "var(--color-surface)",
            fontSize: "var(--dg-fs-body-sm)",
            color: "var(--color-text-primary)",
            outline: "none",
          }}
        />
        {searchQuery && (
          <CloseButton
            size="sm"
            onClick={() => onSearchChange("")}
            aria-label="Clear search"
            style={{ position: "absolute", right: 4, top: "50%", transform: "translateY(-50%)" }}
          />
        )}
      </div>
      <CustomSelect
        value={categoryFilter}
        options={selectOptions}
        onChange={onCategoryChange}
        style={{ minWidth: isMobile ? undefined : 160 }}
        fontSize="var(--dg-fs-body-sm)"
      />
    </div>
  );
}

function DateGroupRow({ label, colSpan }: { label: string; colSpan: number }) {
  return (
    <tr>
      <td
        colSpan={colSpan}
        style={{
          padding: "14px 12px 6px",
          fontSize: "var(--dg-fs-footnote)",
          fontWeight: 700,
          color: "var(--color-text-muted)",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          background: "var(--color-bg)",
          borderBottom: "1px solid var(--color-border-light)",
        }}
      >
        {label}
      </td>
    </tr>
  );
}

function ActionBadge({ action }: { action: string }) {
  const severity = getActionSeverity(action);
  const colors = severityColor(severity);
  const category = ACTIVITY_CATEGORIES.find(
    (c) => c.prefixes.length > 0 && c.prefixes.some((p) => action.startsWith(p)),
  );
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: 4,
        fontSize: "var(--dg-fs-footnote)",
        fontWeight: 600,
        background: colors.bg,
        color: colors.fg,
        whiteSpace: "nowrap",
      }}
    >
      {category?.label ?? "Other"}
    </span>
  );
}

function DetailsCell({ description, details }: { description: string; details: DetailItem[] }) {
  const hasDetails = details.length > 0;

  return (
    <td style={TD_STYLE}>
      <div
        style={{
          fontWeight: 500,
          color: "var(--color-text-primary)",
          marginBottom: hasDetails ? 2 : 0,
        }}
      >
        {description}
      </div>
      {hasDetails && (
        <div
          style={{
            fontSize: "var(--dg-fs-footnote)",
            color: "var(--color-text-muted)",
            lineHeight: 1.5,
          }}
        >
          {details.map((item, i) => (
            <span key={i}>
              {i > 0 && (
                <span style={{ margin: "0 4px", color: "var(--color-text-faint)" }}>·</span>
              )}
              <span style={{ fontWeight: 600 }}>{item.label}:</span> {item.value}
            </span>
          ))}
        </div>
      )}
    </td>
  );
}

function IdentityStack({ primary, secondary }: { primary: string; secondary?: string | null }) {
  const showSecondary = secondary && secondary !== primary;
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ color: "var(--color-text-primary)", fontWeight: 600 }}>{primary}</div>
      {showSecondary && (
        <div style={{ color: "var(--color-text-muted)", fontSize: "var(--dg-fs-footnote)" }}>
          {secondary}
        </div>
      )}
    </div>
  );
}

function Pagination({
  page,
  onPageChange,
  entryCount,
  pageSize,
}: {
  page: number;
  onPageChange: (p: number) => void;
  entryCount: number;
  pageSize: number;
}) {
  const start = page * pageSize + 1;
  const end = page * pageSize + entryCount;
  const hasPrev = page > 0;
  const hasNext = entryCount >= pageSize;

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "12px 0 4px",
        fontSize: "var(--dg-fs-footnote)",
        color: "var(--color-text-muted)",
      }}
    >
      <span>
        Showing {start}–{end}
      </span>
      <div style={{ display: "flex", gap: 8 }}>
        <button
          className="dg-btn dg-btn-secondary dg-btn-sm"
          onClick={() => onPageChange(page - 1)}
          disabled={!hasPrev}
          style={{ opacity: hasPrev ? 1 : 0.4 }}
        >
          Previous
        </button>
        <button
          className="dg-btn dg-btn-secondary dg-btn-sm"
          onClick={() => onPageChange(page + 1)}
          disabled={!hasNext}
          style={{ opacity: hasNext ? 1 : 0.4 }}
        >
          Next
        </button>
      </div>
    </div>
  );
}

function SkeletonTable() {
  return (
    <div style={{ padding: "16px 0" }}>
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="dg-list-row"
          style={{
            display: "flex",
            gap: 16,
            padding: "12px 0",
            borderBottom: "1px solid var(--color-border-light)",
          }}
        >
          <div className="dg-skeleton" style={{ width: 80, height: 12, borderRadius: 4 }} />
          <div className="dg-skeleton" style={{ width: 70, height: 12, borderRadius: 4 }} />
          <div className="dg-skeleton" style={{ flex: 1, height: 12, borderRadius: 4 }} />
          <div className="dg-skeleton" style={{ width: 120, height: 12, borderRadius: 4 }} />
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function ActivityLog({ orgId }: { orgId: string }) {
  const isMobile = useMediaQuery(MOBILE);

  const [entries, setEntries] = useState<FullAuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Single-prefix categories can be server-filtered
  const serverPrefix = useMemo(() => {
    const cat = ACTIVITY_CATEGORIES.find((c) => c.value === categoryFilter);
    if (!cat || cat.prefixes.length !== 1) return undefined;
    return cat.prefixes[0];
  }, [categoryFilter]);

  useEffect(() => {
    let cancelled = false;
    setError(null);

    fetchGridmasterFullAuditLog({
      orgId,
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
      actionPrefix: serverPrefix,
    })
      .then((data) => {
        if (!cancelled) setEntries(data);
      })
      .catch((err) => {
        if (!cancelled)
          setError(formatClientErrorMessage(err, "We couldn't load activity right now."));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [orgId, page, serverPrefix]);

  const handleCategoryChange = (value: string) => {
    setCategoryFilter(value);
    setPage(0);
    setLoading(true);
  };

  const handleSearchChange = (q: string) => {
    setSearchQuery(q);
  };

  const descriptions = useMemo(
    () => new Map(entries.map((e) => [e.id, describeAction(e)])),
    [entries],
  );

  const detailsMap = useMemo(
    () => new Map(entries.map((e) => [e.id, formatDetails(e)])),
    [entries],
  );

  const filteredEntries = useMemo(() => {
    return entries.filter((e) => {
      if (!serverPrefix && !matchesCategory(e.action, categoryFilter)) return false;
      return matchesSearch(e, searchQuery, descriptions.get(e.id) ?? "");
    });
  }, [entries, categoryFilter, searchQuery, serverPrefix, descriptions]);

  const groups = useMemo(() => groupByDate(filteredEntries), [filteredEntries]);

  const COL_COUNT = isMobile ? 3 : 5;

  if (error) {
    return (
      <div style={{ textAlign: "center", padding: 40, color: "var(--color-danger)" }}>{error}</div>
    );
  }

  return (
    <div>
      <Toolbar
        searchQuery={searchQuery}
        onSearchChange={handleSearchChange}
        categoryFilter={categoryFilter}
        onCategoryChange={handleCategoryChange}
        isMobile={isMobile}
      />

      {loading && entries.length === 0 ? (
        <SkeletonTable />
      ) : filteredEntries.length === 0 ? (
        <EmptyState
          title={
            searchQuery || categoryFilter !== "all" ? "No matching activity" : "No activity yet"
          }
          description={
            searchQuery || categoryFilter !== "all"
              ? "Try adjusting your search or filter."
              : "Actions taken in your organization will appear here."
          }
          action={
            searchQuery || categoryFilter !== "all" ? (
              <button
                className="dg-btn dg-btn-secondary dg-btn-sm"
                onClick={() => {
                  setSearchQuery("");
                  setCategoryFilter("all");
                }}
              >
                Clear filters
              </button>
            ) : undefined
          }
        />
      ) : (
        <>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={TH_STYLE}>When</th>
                  <th style={TH_STYLE}>Category</th>
                  {!isMobile && <th style={TH_STYLE}>Who</th>}
                  {!isMobile && <th style={TH_STYLE}>Target</th>}
                  <th style={{ ...TH_STYLE, width: "100%" }}>Details</th>
                </tr>
              </thead>
              <tbody>
                {groups.map((group) => (
                  <React.Fragment key={group.label}>
                    <DateGroupRow label={group.label} colSpan={COL_COUNT} />
                    {group.entries.map((entry) => {
                      const details = detailsMap.get(entry.id) ?? [];
                      const description = descriptions.get(entry.id) ?? "";
                      const actorLabel = getAuditActorLabel(entry);
                      const targetLabel = getAuditTargetLabel(entry);
                      const mobileDescription = `${description}, ${actorLabel} -> ${targetLabel}`;

                      return (
                        <tr key={entry.id} style={{ transition: "background 150ms ease" }}>
                          {/* When */}
                          <td
                            style={{
                              ...TD_STYLE,
                              whiteSpace: "nowrap",
                              color: "var(--color-text-muted)",
                            }}
                          >
                            {formatRelativeTime(entry.createdAt)}
                          </td>

                          {/* Category badge */}
                          <td style={{ ...TD_STYLE, whiteSpace: "nowrap" }}>
                            <ActionBadge action={entry.action} />
                          </td>

                          {/* Who (desktop only) */}
                          {!isMobile && (
                            <td style={{ ...TD_STYLE, whiteSpace: "nowrap" }}>
                              <IdentityStack
                                primary={actorLabel}
                                secondary={getAuditActorSecondaryLabel(entry)}
                              />
                            </td>
                          )}

                          {/* Target (desktop only) */}
                          {!isMobile && (
                            <td style={{ ...TD_STYLE, whiteSpace: "nowrap" }}>
                              <IdentityStack
                                primary={targetLabel}
                                secondary={entry.targetLabel ? entry.targetEmail : null}
                              />
                            </td>
                          )}

                          {/* Details — description + inline data */}
                          <DetailsCell
                            description={isMobile ? mobileDescription : description}
                            details={details}
                          />
                        </tr>
                      );
                    })}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>

          <Pagination
            page={page}
            onPageChange={(p: number) => {
              setPage(p);
              setLoading(true);
            }}
            entryCount={filteredEntries.length}
            pageSize={PAGE_SIZE}
          />
        </>
      )}
    </div>
  );
}
