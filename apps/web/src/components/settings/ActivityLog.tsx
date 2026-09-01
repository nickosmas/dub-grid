"use client";

import React, { useState, useEffect, useMemo } from "react";
import { fetchGridmasterFullAuditLog } from "@/features/gridmaster/client";
import { Button } from "@/components/Button";
import Modal from "@/components/Modal";
import type { FullAuditLogEntry } from "@/types";
import CustomSelect from "@/components/CustomSelect";
import { CloseButton } from "@/components/ui/CloseButton";
import { useMediaQuery, MOBILE } from "@/hooks";
import {
  ACTIVITY_CATEGORIES,
  matchesCategory,
  describeAction,
  getActionSeverity,
  severityColor,
  formatRelativeTime,
  formatDetails,
  groupByDate,
  getAuditActorLabel,
  getAuditActorSecondaryLabel,
  getAuditCategoryLabel,
  getAuditTargetLabel,
  getResourceTypeLabel,
} from "@/lib/activity-log-utils";
import type { DetailItem } from "@/lib/activity-log-utils";
import { formatClientErrorMessage } from "@/lib/client-facing";
import { EmptyState } from "@/components/EmptyState";
import { formatDateTime } from "@/lib/audit/details";

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
  fontWeight: "var(--dg-type-table-heading-weight)",
  color: "var(--dg-type-table-heading-color)",
  fontSize: "var(--dg-type-table-heading-size)",
  letterSpacing: "var(--dg-type-table-heading-letter-spacing)",
  lineHeight: "var(--dg-type-table-heading-line-height)",
  whiteSpace: "nowrap",
  borderBottom: "1px solid var(--dg-color-border)",
  borderRight: "1px solid var(--dg-color-border)",
};

const TD_STYLE: React.CSSProperties = {
  padding: "10px 12px",
  fontSize: "var(--dg-fs-body-sm)",
  verticalAlign: "top",
  borderBottom: "1px solid var(--dg-color-border-light)",
  borderRight: "1px solid var(--dg-color-border-light)",
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
      className="dg-toolbar-type"
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
            color: "var(--dg-color-text-faint)",
            display: "flex",
            pointerEvents: "none",
          }}
        >
          {SEARCH_ICON}
        </span>
        <input
          type="text"
          placeholder="Search activity"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          style={{
            width: "100%",
            padding: `7px ${searchQuery ? 30 : 12}px 7px 32px`,
            borderRadius: "var(--dg-radius-md, 8px)",
            border: "1px solid var(--dg-color-border)",
            background: "var(--dg-color-surface)",
            fontSize: "var(--dg-fs-navigation-item)",
            fontWeight: 400,
            letterSpacing: "normal",
            color: "var(--dg-color-text-primary)",
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
        fontSize="var(--dg-fs-navigation-item)"
        fontWeight={400}
        activeFontWeight={400}
        letterSpacing="normal"
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
          fontSize: "var(--dg-type-table-heading-size)",
          fontWeight: "var(--dg-type-table-heading-weight)",
          color: "var(--dg-type-table-heading-color)",
          letterSpacing: "var(--dg-type-table-heading-letter-spacing)",
          lineHeight: "var(--dg-type-table-heading-line-height)",
          background: "var(--dg-color-bg)",
          borderBottom: "1px solid var(--dg-color-border-light)",
        }}
      >
        {label}
      </td>
    </tr>
  );
}

function ActionBadge({ action }: { action: string }) {
  const colors = severityColor(getActionSeverity(action));
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: 4,
        fontSize: "var(--dg-fs-footnote)",
        fontWeight: 600,
        background: colors.bg,
        border: `1px solid ${colors.border}`,
        color: colors.fg,
        whiteSpace: "nowrap",
      }}
    >
      {getAuditCategoryLabel(action)}
    </span>
  );
}

function DetailsCell({
  description,
  details,
  onOpen,
}: {
  description: string;
  details: DetailItem[];
  onOpen: () => void;
}) {
  const hasDetails = details.length > 0;

  return (
    <td style={TD_STYLE}>
      <div
        style={{
          fontWeight: 500,
          color: "var(--dg-color-text-primary)",
          marginBottom: hasDetails ? 2 : 0,
        }}
      >
        {description}
      </div>
      {hasDetails && (
        <div
          style={{
            fontSize: "var(--dg-fs-footnote)",
            color: "var(--dg-color-text-muted)",
            lineHeight: 1.5,
          }}
        >
          {details.map((item) => (
            <div key={`${item.label}:${item.value}`} style={{ overflowWrap: "anywhere" }}>
              <span style={{ fontWeight: 700 }}>{item.label}:</span> {item.value}
            </div>
          ))}
        </div>
      )}
      <Button
        className="dg-btn dg-btn-ghost dg-btn-sm"
        onClick={(event) => {
          event.stopPropagation();
          onOpen();
        }}
        style={{ marginTop: hasDetails ? 8 : 6 }}
      >
        View details
      </Button>
    </td>
  );
}

function ActivityDetailsDialog({
  entry,
  onClose,
}: {
  entry: FullAuditLogEntry;
  onClose: () => void;
}) {
  const details = formatDetails(entry);
  const actor = getAuditActorLabel(entry);
  const actorSecondary = getAuditActorSecondaryLabel(entry);
  const target = getAuditTargetLabel(entry);
  const targetSecondary = entry.targetLabel ? entry.targetEmail : null;
  const timestamp = new Date(entry.createdAt);

  return (
    <Modal
      title="Activity details"
      onClose={onClose}
      style={{ maxWidth: 600, width: "min(600px, calc(100vw - 32px))" }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <ActionBadge action={entry.action} />
          <div
            style={{
              color: "var(--dg-color-text-primary)",
              fontSize: "var(--dg-fs-card-title)",
              fontWeight: 600,
            }}
          >
            {describeAction(entry)}
          </div>
        </div>
        <DetailRows
          rows={[
            [
              "Date and time",
              Number.isNaN(timestamp.getTime())
                ? entry.createdAt
                : timestamp.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }),
            ],
            ["Performed by", actorSecondary ? `${actor} (${actorSecondary})` : actor],
            ["Target changed", targetSecondary ? `${target} (${targetSecondary})` : target],
            ["Item type", getResourceTypeLabel(entry.resourceType)],
            ["Activity type", getAuditCategoryLabel(entry.action)],
          ]}
        />
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div
            style={{
              color: "var(--dg-type-field-title-color)",
              fontSize: "var(--dg-type-field-title-size)",
              fontWeight: "var(--dg-type-field-title-weight)",
              letterSpacing: "var(--dg-type-field-title-letter-spacing)",
              lineHeight: "var(--dg-type-field-title-line-height)",
            }}
          >
            What changed
          </div>
          {details.length > 0 ? (
            <DetailRows rows={details.map((detail) => [detail.label, detail.value])} />
          ) : (
            <div
              style={{
                color: "var(--dg-color-text-muted)",
                fontSize: "var(--dg-fs-label)",
                fontWeight: 600,
              }}
            >
              No additional details were recorded.
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

function DetailRows({ rows }: { rows: Array<[string, string]> }) {
  return (
    <dl
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(104px, max-content) minmax(0, 1fr)",
        gap: "8px 14px",
        margin: 0,
      }}
    >
      {rows.map(([label, value]) => (
        <React.Fragment key={`${label}:${value}`}>
          <dt
            style={{
              color: "var(--dg-color-text-muted)",
              fontSize: "var(--dg-fs-caption)",
              fontWeight: 600,
            }}
          >
            {label}
          </dt>
          <dd
            style={{
              color: "var(--dg-color-text-primary)",
              fontSize: "var(--dg-fs-label)",
              fontWeight: 650,
              margin: 0,
              overflowWrap: "anywhere",
            }}
          >
            {value}
          </dd>
        </React.Fragment>
      ))}
    </dl>
  );
}

function IdentityStack({ primary, secondary }: { primary: string; secondary?: string | null }) {
  const showSecondary = secondary && secondary !== primary;
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ color: "var(--dg-color-text-primary)", fontWeight: 600 }}>{primary}</div>
      {showSecondary && (
        <div style={{ color: "var(--dg-color-text-muted)", fontSize: "var(--dg-fs-footnote)" }}>
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
        color: "var(--dg-color-text-muted)",
      }}
    >
      <span>
        Showing {start}–{end}
      </span>
      <div style={{ display: "flex", gap: 8 }}>
        <Button
          className="dg-btn dg-btn-secondary dg-btn-sm"
          onClick={() => onPageChange(page - 1)}
          disabled={!hasPrev}
          style={{ opacity: hasPrev ? 1 : 0.4 }}
        >
          Previous
        </Button>
        <Button
          className="dg-btn dg-btn-secondary dg-btn-sm"
          onClick={() => onPageChange(page + 1)}
          disabled={!hasNext}
          style={{ opacity: hasNext ? 1 : 0.4 }}
        >
          Next
        </Button>
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
            borderBottom: "1px solid var(--dg-color-border-light)",
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
  const [selectedEntry, setSelectedEntry] = useState<FullAuditLogEntry | null>(null);

  // Every category filters server-side, so the page counts stay honest.
  const serverPrefixes = useMemo(
    () => ACTIVITY_CATEGORIES.find((c) => c.value === categoryFilter)?.prefixes ?? [],
    [categoryFilter],
  );

  useEffect(() => {
    let cancelled = false;
    setError(null);

    fetchGridmasterFullAuditLog({
      orgId,
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
      actionPrefixes: serverPrefixes.length > 0 ? serverPrefixes : undefined,
      target: searchQuery.trim() || undefined,
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
  }, [orgId, page, searchQuery, serverPrefixes]);

  const handleCategoryChange = (value: string) => {
    setCategoryFilter(value);
    setPage(0);
    setLoading(true);
  };

  const handleSearchChange = (q: string) => {
    setSearchQuery(q);
    setPage(0);
    setLoading(true);
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
    return entries.filter((entry) => matchesCategory(entry.action, categoryFilter));
  }, [entries, categoryFilter]);

  const groups = useMemo(() => groupByDate(filteredEntries), [filteredEntries]);

  const COL_COUNT = isMobile ? 3 : 5;

  if (error) {
    return (
      <div style={{ textAlign: "center", padding: 40, color: "var(--dg-color-danger)" }}>
        {error}
      </div>
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
              <Button
                className="dg-btn dg-btn-secondary dg-btn-sm"
                onClick={() => {
                  setSearchQuery("");
                  setCategoryFilter("all");
                }}
              >
                Clear filters
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          <div
            style={{
              overflowX: "auto",
              border: "1px solid var(--dg-color-border)",
              borderRadius: "var(--dg-radius-lg)",
              background: "var(--dg-color-surface)",
            }}
          >
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={TH_STYLE}>Date and time</th>
                  <th style={TH_STYLE}>Activity type</th>
                  {!isMobile && <th style={TH_STYLE}>Performed by</th>}
                  {!isMobile && <th style={TH_STYLE}>Target changed</th>}
                  <th style={{ ...TH_STYLE, width: "100%" }}>Activity and changes</th>
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
                      const mobileDescription = `${description}. Performed by ${actorLabel}. Target changed: ${targetLabel}.`;
                      const exactDateTime = formatDateTime(entry.createdAt);

                      return (
                        <tr
                          key={entry.id}
                          onClick={() => setSelectedEntry(entry)}
                          style={{ cursor: "pointer", transition: "background 150ms ease" }}
                        >
                          {/* When */}
                          <td
                            style={{
                              ...TD_STYLE,
                              whiteSpace: "nowrap",
                              color: "var(--dg-color-text-muted)",
                            }}
                          >
                            {formatRelativeTime(entry.createdAt)}
                            {exactDateTime && (
                              <div
                                style={{
                                  marginTop: 2,
                                  color: "var(--dg-color-text-faint)",
                                  fontSize: "var(--dg-fs-footnote)",
                                }}
                              >
                                {exactDateTime}
                              </div>
                            )}
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
                            onOpen={() => setSelectedEntry(entry)}
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
      {selectedEntry ? (
        <ActivityDetailsDialog entry={selectedEntry} onClose={() => setSelectedEntry(null)} />
      ) : null}
    </div>
  );
}
