"use client";

import React from "react";
import {
  ArrowLeftRight,
  Building2,
  CalendarDays,
  CircleDot,
  CreditCard,
  Database,
  Eye,
  KeyRound,
  Mail,
  Repeat,
  Server,
  ShieldCheck,
  SlidersHorizontal,
  User,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/Button";
import Modal from "@/components/Modal";
import { ShiftChangeCard } from "@/components/shift-change/ShiftChangeCard";
import { StatusPill, type StatusPillTone } from "@/components/ui/status-pill";
import type { FullAuditLogEntry } from "@/types";
import { getAuditCategory, type AuditCategory } from "@/lib/audit/registry";
import { formatDateTime } from "@/lib/audit/details";
import {
  describeAction,
  formatActivityTimestamp,
  formatDetails,
  formatRelativeTime,
  getActionSeverity,
  getAuditActorLabel,
  getAuditActorSecondaryLabel,
  getAuditCategoryLabel,
  getAuditTargetLabel,
  getResourceTypeLabel,
  type DetailItem,
} from "@/lib/activity-log-utils";

/** Any audit-shaped entry; ids differ between the org log and the person timeline. */
export type ActivityEntryLike = Omit<FullAuditLogEntry, "id">;

export const ACTION_TONES = {
  create: "success",
  delete: "danger",
  warning: "warning",
  update: "neutral",
} satisfies Record<ReturnType<typeof getActionSeverity>, StatusPillTone>;

export function ActionBadge({ action }: { action: string }) {
  return (
    <StatusPill tone={ACTION_TONES[getActionSeverity(action)]} variant="category">
      {getAuditCategoryLabel(action)}
    </StatusPill>
  );
}

const CATEGORY_ICONS: Record<AuditCategory, LucideIcon> = {
  people: User,
  schedule: CalendarDays,
  requests: ArrowLeftRight,
  access: KeyRound,
  invitations: Mail,
  setup: SlidersHorizontal,
  recurring: Repeat,
  organization: Building2,
  impersonation: Eye,
  billing: CreditCard,
  data: Database,
  security: ShieldCheck,
  platform: Server,
};

/** The kind of change as an icon tile, tinted like its badge. */
export function ActivityKindIcon({ action }: { action: string }) {
  const category = getAuditCategory(action);
  const Icon = category ? CATEGORY_ICONS[category] : CircleDot;
  return (
    <span className="dg-activity-kind-icon" data-tone={ACTION_TONES[getActionSeverity(action)]}>
      <Icon size={15} strokeWidth={2} aria-hidden />
    </span>
  );
}

export function ActivityDetailsDialog({
  entry,
  onClose,
  timeZone = null,
  showOrganization = false,
}: {
  entry: ActivityEntryLike;
  onClose: () => void;
  /** The organization's zone, so the timestamp matches the day it is filed under. */
  timeZone?: string | null;
  /** Gridmaster only: which organization the event belongs to. */
  showOrganization?: boolean;
}) {
  const details = formatDetails(entry);
  const actor = getAuditActorLabel(entry);
  const actorSecondary = getAuditActorSecondaryLabel(entry);
  const target = getAuditTargetLabel(entry);
  const targetSecondary = entry.targetLabel ? entry.targetEmail : null;

  const rows: Array<[string, React.ReactNode]> = [
    ["Date and time", formatActivityTimestamp(entry.createdAt, timeZone)],
    ["By", <ActivityDetailIdentity key="actor" primary={actor} secondary={actorSecondary} />],
    [
      "Affected",
      <ActivityDetailIdentity key="target" primary={target} secondary={targetSecondary} />,
    ],
    ["Item", getResourceTypeLabel(entry.resourceType)],
    ["Kind of change", getAuditCategoryLabel(entry.action)],
  ];

  if (showOrganization) {
    rows.push([
      "Organization",
      entry.orgName ?? (entry.orgId ? "Unknown organization" : "Platform-wide"),
    ]);
  }

  return (
    <Modal title="Activity details" onClose={onClose} className="dg-activity-details-modal">
      <div className="dg-activity-details">
        <div className="dg-activity-details-summary">
          <ActionBadge action={entry.action} />
          <div className="dg-activity-details-headline">{describeAction(entry)}</div>
        </div>
        <DetailRows rows={rows} />
        <section className="dg-activity-details-changes" aria-labelledby="activity-changes-title">
          <div id="activity-changes-title" className="dg-type-content-group-heading">
            What changed
          </div>
          {entry.shiftChange && entry.shiftChange.kind !== "none" ? (
            <ShiftChangeCard change={entry.shiftChange} layout="stacked" showDayBar />
          ) : details.length > 0 ? (
            <DetailRows
              rows={details.map((detail): [string, React.ReactNode] => [
                detail.label,
                detail.value,
              ])}
            />
          ) : (
            <div className="dg-activity-details-empty">No additional details were recorded.</div>
          )}
        </section>
      </div>
    </Modal>
  );
}

function DetailRows({ rows }: { rows: Array<[string, React.ReactNode]> }) {
  return (
    <dl className="dg-activity-details-list">
      {rows.map(([label, value], index) => (
        <div className="dg-activity-details-row" key={`${label}:${index}`}>
          <dt className="dg-activity-details-label">{label}</dt>
          <dd className="dg-activity-details-value">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function ActivityDetailIdentity({
  primary,
  secondary,
}: {
  primary: string;
  secondary?: string | null;
}) {
  const showSecondary = secondary && secondary !== primary;

  return (
    <span className="dg-activity-details-identity">
      <span className="dg-activity-details-identity-primary">{primary}</span>
      {showSecondary ? (
        <span className="dg-activity-details-identity-secondary">{secondary}</span>
      ) : null}
    </span>
  );
}
