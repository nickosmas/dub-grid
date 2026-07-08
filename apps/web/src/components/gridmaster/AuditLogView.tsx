"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchGridmasterFullAuditLog } from "@/features/gridmaster/client";
import { sectionStyle, thStyle, tdStyle } from "@/lib/styles";
import Modal from "@/components/Modal";
import {
  describeAction,
  formatDetails,
  formatRelativeTime,
  getAuditActorLabel,
  getAuditActorSecondaryLabel,
  getAuditTargetLabel,
  summarizeDetails,
} from "@/lib/activity-log-utils";
import CustomSelect from "@/components/CustomSelect";
import { EmptyState } from "@/components/EmptyState";
import { MaybeHint } from "@/components/ui/hint";
import { queryKeys } from "@/lib/query-keys";
import { formatClientErrorMessage } from "@/lib/client-facing";
import type { FullAuditLogEntry } from "@/types";

const ACTION_LABELS: Record<string, string> = {
  "org.created": "Organization created",
  "org.updated": "Organization updated",
  "org.archived": "Organization archived",
  "org.restored": "Organization restored",
  "org.suspended": "Organization suspended",
  "org.unsuspended": "Organization unsuspended",
  "org.deleted": "Organization deleted",
  "role.changed": "Role changed",
  "role.assigned": "Role assigned",
  "permissions.updated": "Permissions updated",
  "gridmaster_account.promoted": "Gridmaster promoted",
  "gridmaster_account.demoted": "Gridmaster demoted",
  "gridmaster_account.deactivated": "Gridmaster deactivated",
  "gridmaster_account.reactivated": "Gridmaster reactivated",
  "user.removed_from_org": "User removed",
  "user.deactivated": "User deactivated",
  "user.reactivated": "User reactivated",
  "user.force_logout": "Force logout",
  "user.password_reset_sent": "Password reset",
  "impersonation.started": "Impersonation started",
  "impersonation.ended": "Impersonation ended",
  "invitation.sent": "Invitation sent",
  "invitation.accepted": "Invitation accepted",
  "invitation.revoked": "Invitation revoked",
  "invitation.resent": "Invitation resent",
  "employee.created": "Employee created",
  "employee.updated": "Employee updated",
  "employee.deactivated": "Employee marked inactive",
  "employee.activated": "Employee activated",
  "employee.removed": "Employee removed",
  // Historical keys before the bench→deactivate / terminate→remove rename.
  // Older audit rows still carry these — keep them rendering with the new copy.
  "employee.benched": "Employee marked inactive",
  "employee.archived": "Employee removed",
  "shift.created": "Shift created",
  "shift.updated": "Shift updated",
  "shift.deleted": "Shift deleted",
  "schedule.published": "Schedule published",
  "schedule.drafts_discarded": "Drafts discarded",
  "billing.trial_extended": "Trial extended",
  "billing.subscription_canceled": "Subscription canceled",
  "billing.synced": "Billing synced",
  "billing.status_overridden": "Billing status override",
  "feature_flags.updated": "Runtime controls updated",
};

function getActionLabel(action: string): string {
  return (
    ACTION_LABELS[action] ??
    action
      .replace(/[._-]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

const RESOURCE_TYPE_LABELS: Record<string, string> = {
  data_export: "Data export",
  employee: "Employee",
  impersonation_session: "Impersonation session",
  invitation: "Invitation",
  organization: "Organization",
  organization_membership: "Organization access",
  schedule: "Schedule",
  shift: "Shift",
  user: "User account",
};

function getResourceTypeLabel(resourceType: string): string {
  return (
    RESOURCE_TYPE_LABELS[resourceType] ??
    resourceType
      .replace(/[._-]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

function ActionBadge({ action }: { action: string }) {
  const isDestructive =
    action.includes("deleted") ||
    action.includes("removed") ||
    action.includes("suspended") ||
    action.includes("deactivated") ||
    action.includes("terminated") ||
    action.includes("revoked") ||
    action.includes("force_logout");
  const isCreate =
    action.includes("created") ||
    action.includes("restored") ||
    action.includes("activated") ||
    action.includes("accepted") ||
    action.includes("unsuspended") ||
    action.includes("reactivated");
  const isImpersonation = action.includes("impersonation");

  const bg = isDestructive
    ? "var(--color-danger-bg)"
    : isCreate
      ? "var(--color-success-bg)"
      : isImpersonation
        ? "var(--color-warning-bg)"
        : "var(--color-bg-secondary)";
  const color = isDestructive
    ? "var(--color-danger)"
    : isCreate
      ? "var(--color-success)"
      : isImpersonation
        ? "var(--color-warning)"
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

function IdentityStack({ primary, secondary }: { primary: string; secondary?: string | null }) {
  const showSecondary = secondary && secondary !== primary;
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ color: "var(--color-text-primary)", fontWeight: 600 }}>{primary}</div>
      {showSecondary && (
        <div style={{ color: "var(--color-text-muted)", fontSize: "var(--dg-fs-caption)" }}>
          {secondary}
        </div>
      )}
    </div>
  );
}

function DetailsSummary({ details, action }: { details: Record<string, unknown>; action: string }) {
  if (!details || Object.keys(details).length === 0)
    return <span style={{ color: "var(--color-text-faint)" }}>—</span>;

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
          color: "var(--color-text-muted)",
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

// Available action categories for filtering
const ACTION_CATEGORIES = [
  { value: "all", label: "All Actions" },
  { value: "org.", label: "Organization" },
  { value: "role.", label: "Roles & Permissions" },
  { value: "gridmaster_account.", label: "Gridmaster Accounts" },
  { value: "user.", label: "User Management" },
  { value: "impersonation.", label: "Impersonation" },
  { value: "invitation.", label: "Invitations" },
  { value: "employee.", label: "Employees" },
  { value: "shift.", label: "Shifts" },
  { value: "schedule.", label: "Schedule" },
  { value: "billing.", label: "Billing" },
  { value: "feature_flags.", label: "Runtime Controls" },
];

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
        actionPrefix: actionFilter === "all" ? undefined : actionFilter,
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

  const actionOptions = useMemo(() => ACTION_CATEGORIES, []);

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
            color: "var(--color-text-primary)",
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
          <input
            className="dg-input"
            value={resourceType}
            onChange={(event) => {
              setResourceType(event.target.value);
              setPage(0);
            }}
            placeholder="Resource"
            aria-label="Resource type"
            style={{ width: 130, fontSize: "var(--dg-fs-caption)" }}
          />
          <input
            className="dg-input"
            value={target}
            onChange={(event) => {
              setTarget(event.target.value);
              setPage(0);
            }}
            placeholder="Target / details"
            aria-label="Target search"
            style={{ width: 170, fontSize: "var(--dg-fs-caption)" }}
          />
          <label
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              fontSize: "var(--dg-fs-caption)",
              color: "var(--color-text-muted)",
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

      {auditQuery.isLoading ? (
        <div style={sectionStyle}>
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                gap: 16,
                padding: "12px 14px",
                borderBottom: "1px solid var(--color-border-light)",
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
                      <th style={{ ...thStyle, background: "var(--color-bg-secondary)" }}>
                        Timestamp
                      </th>
                      <th style={{ ...thStyle, background: "var(--color-bg-secondary)" }}>
                        Action
                      </th>
                      <th style={{ ...thStyle, background: "var(--color-bg-secondary)" }}>Actor</th>
                      <th style={{ ...thStyle, background: "var(--color-bg-secondary)" }}>
                        Target
                      </th>
                      <th style={{ ...thStyle, background: "var(--color-bg-secondary)" }}>
                        Details
                      </th>
                      {!orgId && (
                        <th style={{ ...thStyle, background: "var(--color-bg-secondary)" }}>Org</th>
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
                          aria-label={`${getActionLabel(e.action)} audit details`}
                          onClick={() => setSelectedEntry(e)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              setSelectedEntry(e);
                            }
                          }}
                          style={{
                            background: idx % 2 === 1 ? "var(--color-row-alt)" : undefined,
                            cursor: "pointer",
                          }}
                        >
                          <td
                            style={{
                              ...tdStyle,
                              fontSize: "var(--dg-fs-caption)",
                              color: "var(--color-text-muted)",
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
                                  color: "var(--color-text-muted)",
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
                                color: "var(--color-text-faint)",
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
                                color: "var(--color-text-muted)",
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
            <button
              className="dg-btn dg-btn-secondary dg-btn-sm"
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              Previous
            </button>
            <span
              style={{
                fontSize: "var(--dg-fs-caption)",
                color: "var(--color-text-muted)",
                fontFamily: "var(--font-dm-mono), monospace",
              }}
            >
              {page * PAGE_SIZE + 1}–{page * PAGE_SIZE + entries.length}
            </span>
            <button
              className="dg-btn dg-btn-secondary dg-btn-sm"
              disabled={entries.length < PAGE_SIZE}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </button>
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
              color: "var(--color-text-primary)",
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
            ["Action", getActionLabel(entry.action)],
          ]}
        />

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div
            style={{
              color: "var(--color-text-muted)",
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
                color: "var(--color-text-muted)",
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
          color: "var(--color-text-muted)",
          fontSize: "var(--dg-fs-caption)",
          fontWeight: 800,
        }}
      >
        {label}
      </dt>
      <dd
        style={{
          color: "var(--color-text-primary)",
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
