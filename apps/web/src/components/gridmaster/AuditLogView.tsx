"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchGridmasterFullAuditLog } from "@/features/gridmaster/client";
import { Button } from "@/components/Button";
import { sectionStyle, thStyle, tdStyle } from "@/lib/styles";
import Modal from "@/components/Modal";
import {
  describeAction,
  formatDetails,
  formatRelativeTime,
  getAuditActorLabel,
  getAuditActorSecondaryLabel,
  getAuditCategoryLabel,
  getAuditTargetLabel,
  getResourceTypeLabel,
  severityColor,
  summarizeDetails,
} from "@/lib/activity-log-utils";
import {
  AUDIT_CATEGORY_OPTIONS,
  AUDIT_RESOURCE_TYPE_OPTIONS,
  getAuditSeverity,
} from "@/lib/audit/registry";
import CustomSelect from "@/components/CustomSelect";
import { EmptyState } from "@/components/EmptyState";
import { MaybeHint } from "@/components/ui/hint";
import { queryKeys } from "@/lib/query-keys";
import { formatClientErrorMessage } from "@/lib/client-facing";
import type { FullAuditLogEntry } from "@/types";

function ActionBadge({ action }: { action: string }) {
  const colors = severityColor(getAuditSeverity(action));

  return (
    <span
      style={{
        display: "inline-block",
        fontSize: "var(--dg-fs-footnote)",
        fontWeight: 600,
        padding: "2px 8px",
        borderRadius: 4,
        background: colors.bg,
        color: colors.fg,
        whiteSpace: "nowrap",
      }}
    >
      {getAuditCategoryLabel(action)}
    </span>
  );
}

function IdentityStack({ primary, secondary }: { primary: string; secondary?: string | null }) {
  const showSecondary = secondary && secondary !== primary;
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ color: "var(--dg-color-text-primary)", fontWeight: 600 }}>{primary}</div>
      {showSecondary && (
        <div style={{ color: "var(--dg-color-text-muted)", fontSize: "var(--dg-fs-caption)" }}>
          {secondary}
        </div>
      )}
    </div>
  );
}

function DetailsSummary({ details, action }: { details: Record<string, unknown>; action: string }) {
  if (!details || Object.keys(details).length === 0)
    return <span style={{ color: "var(--dg-color-text-faint)" }}>—</span>;

  const entry = {
    id: 0,
    orgId: null,
    orgName: null,
    actorId: null,
    actorEmail: null,
    actorName: null,
    action,
    resourceType: "",
    resourceId: null,
    targetLabel: null,
    targetEmail: null,
    details,
    createdAt: new Date().toISOString(),
  };
  const summary = summarizeDetails(entry);
  const detailItems = formatDetails(entry);
  const hintContent =
    detailItems.length > 0
      ? detailItems.map((item) => `${item.label}: ${item.value}`).join("\n")
      : "No extra details";

  return (
    <MaybeHint content={hintContent} side="bottom">
      <span
        style={{
          fontSize: "var(--dg-fs-footnote)",
          color: "var(--dg-color-text-muted)",
          maxWidth: 200,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          display: "inline-block",
        }}
      >
        {summary}
      </span>
    </MaybeHint>
  );
}

export default function AuditLogView({
  orgId,
  title,
  initialActionFilter = "all",
}: {
  orgId?: string;
  title?: string;
  initialActionFilter?: string;
}) {
  const [page, setPage] = useState(0);
  const [actionFilter, setActionFilter] = useState(initialActionFilter);
  const [resourceType, setResourceType] = useState("");
  const [target, setTarget] = useState("");
  const [highRiskOnly, setHighRiskOnly] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<FullAuditLogEntry | null>(null);
  const PAGE_SIZE = 50;
  const filterKey = JSON.stringify({
    actionFilter,
    resourceType,
    target,
    highRiskOnly,
  });

  const auditQuery = useQuery({
    queryKey: queryKeys.gridmaster.orgAudit(orgId ?? null, page, PAGE_SIZE, filterKey),
    queryFn: () =>
      fetchGridmasterFullAuditLog({
        orgId,
        actionPrefixes:
          AUDIT_CATEGORY_OPTIONS.find((option) => option.value === actionFilter)?.prefixes ??
          undefined,
        resourceType: resourceType || undefined,
        target: target.trim() || undefined,
        highRiskOnly,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      }),
    staleTime: 30_000,
  });
  const entries = auditQuery.data ?? [];
  const error = auditQuery.error
    ? formatClientErrorMessage(auditQuery.error, "We couldn't load the audit log right now.")
    : null;

  const actionOptions = useMemo(
    () => AUDIT_CATEGORY_OPTIONS.map(({ value, label }) => ({ value, label })),
    [],
  );

  return (
    <>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 16,
          flexWrap: "wrap",
          gap: 8,
        }}
      >
        <h2
          style={{
            margin: 0,
            fontSize: "var(--dg-fs-page-title)",
            fontWeight: 700,
            color: "var(--dg-color-text-primary)",
          }}
        >
          {title ?? "Audit Log"}
        </h2>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <CustomSelect
            value={actionFilter}
            options={actionOptions}
            onChange={(v) => {
              setActionFilter(v);
              setPage(0);
            }}
            style={{ width: "auto", minWidth: 160 }}
            fontSize={12}
          />
          <CustomSelect
            value={resourceType}
            options={AUDIT_RESOURCE_TYPE_OPTIONS}
            onChange={(value) => {
              setResourceType(value);
              setPage(0);
            }}
            aria-label="Record type"
            style={{ width: "auto", minWidth: 170 }}
            fontSize={12}
          />
          <input
            className="dg-input"
            value={target}
            onChange={(event) => {
              setTarget(event.target.value);
              setPage(0);
            }}
            placeholder="Search people or details"
            aria-label="Search people or details"
            style={{ width: 190, fontSize: "var(--dg-fs-caption)" }}
          />
          <label
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              fontSize: "var(--dg-fs-caption)",
              color: "var(--dg-color-text-muted)",
              fontWeight: 700,
            }}
          >
            <input
              type="checkbox"
              checked={highRiskOnly}
              onChange={(event) => {
                setHighRiskOnly(event.target.checked);
                setPage(0);
              }}
            />
            High risk
          </label>
        </div>
      </div>

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

      {auditQuery.isLoading ? (
        <div style={sectionStyle}>
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                gap: 16,
                padding: "12px 14px",
                borderBottom: "1px solid var(--dg-color-border-light)",
              }}
            >
              <div className="dg-skeleton dg-skeleton--text" style={{ width: "18%" }} />
              <div className="dg-skeleton dg-skeleton--text" style={{ width: "14%" }} />
              <div className="dg-skeleton dg-skeleton--text" style={{ width: "20%" }} />
              <div className="dg-skeleton dg-skeleton--text" style={{ width: "14%" }} />
              <div className="dg-skeleton dg-skeleton--text" style={{ width: "22%" }} />
              <div className="dg-skeleton dg-skeleton--text" style={{ width: "12%" }} />
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
                      <th style={{ ...thStyle, background: "var(--dg-color-bg-secondary)" }}>
                        Timestamp
                      </th>
                      <th style={{ ...thStyle, background: "var(--dg-color-bg-secondary)" }}>
                        Action
                      </th>
                      <th style={{ ...thStyle, background: "var(--dg-color-bg-secondary)" }}>
                        Actor
                      </th>
                      <th style={{ ...thStyle, background: "var(--dg-color-bg-secondary)" }}>
                        Target
                      </th>
                      <th style={{ ...thStyle, background: "var(--dg-color-bg-secondary)" }}>
                        Details
                      </th>
                      {!orgId && (
                        <th style={{ ...thStyle, background: "var(--dg-color-bg-secondary)" }}>
                          Org
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((e, idx) => {
                      const date = new Date(e.createdAt);
                      const actorLabel = getAuditActorLabel(e);
                      const targetLabel = getAuditTargetLabel(e);
                      const actionDescription = describeAction(e);
                      return (
                        <tr
                          key={e.id}
                          tabIndex={0}
                          aria-label={`${describeAction(e)} — activity details`}
                          onClick={() => setSelectedEntry(e)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              setSelectedEntry(e);
                            }
                          }}
                          style={{
                            background: idx % 2 === 1 ? "var(--dg-color-row-alt)" : undefined,
                            cursor: "pointer",
                          }}
                        >
                          <td
                            style={{
                              ...tdStyle,
                              fontSize: "var(--dg-fs-caption)",
                              color: "var(--dg-color-text-muted)",
                              whiteSpace: "nowrap",
                              fontFamily: "var(--font-dm-mono), monospace",
                            }}
                          >
                            <MaybeHint
                              content={date.toLocaleString("en-US", {
                                weekday: "long",
                                month: "long",
                                day: "numeric",
                                year: "numeric",
                                hour: "numeric",
                                minute: "2-digit",
                                timeZoneName: "short",
                              })}
                              side="bottom"
                            >
                              <span>{formatRelativeTime(e.createdAt)}</span>
                            </MaybeHint>
                          </td>
                          <td style={tdStyle}>
                            <div
                              style={{
                                display: "flex",
                                flexDirection: "column",
                                gap: 4,
                                alignItems: "flex-start",
                              }}
                            >
                              <ActionBadge action={e.action} />
                              <span
                                style={{
                                  fontSize: "var(--dg-fs-footnote)",
                                  color: "var(--dg-color-text-muted)",
                                  maxWidth: 220,
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {actionDescription}
                              </span>
                            </div>
                          </td>
                          <td style={{ ...tdStyle, fontSize: "var(--dg-fs-caption)" }}>
                            <IdentityStack
                              primary={actorLabel}
                              secondary={getAuditActorSecondaryLabel(e)}
                            />
                          </td>
                          <td style={{ ...tdStyle, fontSize: "var(--dg-fs-caption)" }}>
                            <IdentityStack
                              primary={targetLabel}
                              secondary={e.targetLabel ? e.targetEmail : null}
                            />
                            <div
                              style={{
                                color: "var(--dg-color-text-faint)",
                                fontSize: "var(--dg-fs-caption)",
                                marginTop: 2,
                              }}
                            >
                              {getResourceTypeLabel(e.resourceType)}
                            </div>
                          </td>
                          <td style={tdStyle}>
                            <DetailsSummary details={e.details} action={e.action} />
                          </td>
                          {!orgId && (
                            <td
                              style={{
                                ...tdStyle,
                                fontSize: "var(--dg-fs-caption)",
                                color: "var(--dg-color-text-muted)",
                              }}
                            >
                              {e.orgName ?? (e.orgId ? "Unknown organization" : "Platform-wide")}
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
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                  <polyline points="10 9 9 9 8 9" />
                </svg>
              }
              title="No audit log entries"
              description={
                actionFilter !== "all" || resourceType || target || highRiskOnly
                  ? "Try changing the filters to see more entries."
                  : undefined
              }
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
                color: "var(--dg-color-text-muted)",
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
      {selectedEntry ? (
        <AuditEntryDetailsDialog entry={selectedEntry} onClose={() => setSelectedEntry(null)} />
      ) : null}
    </>
  );
}

function AuditEntryDetailsDialog({
  entry,
  onClose,
}: {
  entry: FullAuditLogEntry;
  onClose: () => void;
}) {
  const detailItems = formatDetails(entry);
  const actorLabel = getAuditActorLabel(entry);
  const targetLabel = getAuditTargetLabel(entry);
  const actorSecondary = getAuditActorSecondaryLabel(entry);
  const targetSecondary = entry.targetLabel ? entry.targetEmail : null;

  return (
    <Modal
      title="Audit log details"
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
              fontWeight: 800,
            }}
          >
            {describeAction(entry)}
          </div>
        </div>

        <AuditDetailRows
          rows={[
            ["Timestamp", formatTimestamp(entry.createdAt)],
            ["Actor", actorSecondary ? `${actorLabel} (${actorSecondary})` : actorLabel],
            ["Target", targetSecondary ? `${targetLabel} (${targetSecondary})` : targetLabel],
            ["Record type", getResourceTypeLabel(entry.resourceType)],
            [
              "Organization",
              entry.orgName ?? (entry.orgId ? "Unknown organization" : "Platform-wide"),
            ],
            ["Category", getAuditCategoryLabel(entry.action)],
          ]}
        />

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div
            style={{
              color: "var(--dg-color-text-muted)",
              fontSize: "var(--dg-fs-caption)",
              fontWeight: 800,
              textTransform: "uppercase",
            }}
          >
            Event details
          </div>
          {detailItems.length > 0 ? (
            <AuditDetailRows rows={detailItems.map((item) => [item.label, item.value])} />
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

function AuditDetailRows({ rows }: { rows: Array<[string, string]> }) {
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
        <AuditDetailRow key={`${label}:${value}`} label={label} value={value} />
      ))}
    </dl>
  );
}

function AuditDetailRow({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt
        style={{
          color: "var(--dg-color-text-muted)",
          fontSize: "var(--dg-fs-caption)",
          fontWeight: 800,
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
    </>
  );
}

function formatTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}
