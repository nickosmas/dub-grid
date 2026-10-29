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
import Modal from "@/components/Modal";
import { ShiftChangeCard } from "@/components/shift-change/ShiftChangeCard";
import type { StatusPillTone } from "@/components/ui/status-pill";
import type { FullAuditLogEntry } from "@/types";
import { getAuditCategory, type AuditCategory } from "@/lib/audit/registry";
import {
  describeAction,
  formatActivityRowDetails,
  formatActivityTimestamp,
  getActionSeverity,
  getAuditActorLabel,
  getAuditActorSecondaryLabel,
  getAuditCategoryLabel,
  getAuditTargetLabel,
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

/** The kind of change as an icon tile, tinted by how much it changed. */
export function ActivityKindIcon({ action, size = "md" }: { action: string; size?: "md" | "lg" }) {
  const category = getAuditCategory(action);
  const Icon = category ? CATEGORY_ICONS[category] : CircleDot;
  return (
    <span
      className="dg-activity-kind-icon"
      data-size={size}
      data-tone={ACTION_TONES[getActionSeverity(action)]}
    >
      <Icon size={size === "lg" ? 18 : 15} strokeWidth={2} aria-hidden />
    </span>
  );
}

/** The kind's name, colored like its icon. */
export function ActivityKindLabel({ action }: { action: string }) {
  return (
    <div className="dg-activity-kind" data-tone={ACTION_TONES[getActionSeverity(action)]}>
      {getAuditCategoryLabel(action)}
    </div>
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
  const { details } = formatActivityRowDetails(entry);
  const shiftChange =
    entry.shiftChange && entry.shiftChange.kind !== "none" ? entry.shiftChange : null;
  const target = getAuditTargetLabel(entry);
  const organization = showOrganization
    ? (entry.orgName ?? (entry.orgId ? "Unknown organization" : "Platform-wide"))
    : null;

  return (
    <Modal
      title="Activity details"
      heading={
        <div className="dg-activity-details-heading">
          <ActivityKindIcon action={entry.action} size="lg" />
          <div className="dg-activity-details-titles">
            <ActivityKindLabel action={entry.action} />
            <h2 className="dg-activity-details-headline">{describeAction(entry)}</h2>
            <div className="dg-activity-details-meta">
              {organization ? (
                <>
                  <span>{organization}</span>
                  <span aria-hidden>·</span>
                </>
              ) : null}
              <span>{formatActivityTimestamp(entry.createdAt, timeZone)}</span>
            </div>
          </div>
        </div>
      }
      onClose={onClose}
      className="dg-activity-details-modal"
    >
      <div className="dg-activity-details">
        <div className="dg-activity-details-people">
          <ActivityDetailPerson
            label="By"
            primary={getAuditActorLabel(entry)}
            secondary={getAuditActorSecondaryLabel(entry)}
          />
          <ActivityDetailPerson
            label="Affected"
            primary={target}
            secondary={entry.targetLabel ? entry.targetEmail : null}
          />
        </div>
        <section className="dg-activity-details-changes" aria-labelledby="activity-changes-title">
          <h3 id="activity-changes-title" className="dg-type-content-group-heading">
            What changed
          </h3>
          {shiftChange ? (
            <ShiftChangeCard change={shiftChange} layout="stacked" showDayBar />
          ) : details.length > 0 ? (
            <DetailRows items={details} />
          ) : (
            <div className="dg-activity-details-empty">No additional details were recorded.</div>
          )}
        </section>
        {shiftChange && details.length > 0 ? (
          <dl className="dg-activity-details-note">
            {details.map((item) => (
              <div key={`${item.label}:${item.value}`}>
                <dt className="dg-activity-details-label">{item.label}</dt>
                <dd className="dg-activity-details-value">{item.value}</dd>
              </div>
            ))}
          </dl>
        ) : null}
      </div>
    </Modal>
  );
}

function DetailRows({ items }: { items: DetailItem[] }) {
  return (
    <dl className="dg-activity-details-list">
      {items.map((item) => (
        <div className="dg-activity-details-row" key={`${item.label}:${item.value}`}>
          <dt className="dg-activity-details-label">{item.label}</dt>
          <dd className="dg-activity-details-value">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function ActivityDetailPerson({
  label,
  primary,
  secondary,
}: {
  label: string;
  primary: string;
  secondary?: string | null;
}) {
  return (
    <div className="dg-activity-details-person">
      <div className="dg-activity-details-label">{label}</div>
      <div className="dg-activity-details-identity-primary">{primary}</div>
      {secondary && secondary !== primary ? (
        <div className="dg-activity-details-identity-secondary">{secondary}</div>
      ) : null}
    </div>
  );
}
