"use client";

import { EmptyState } from "@/components/EmptyState";
import React, { useMemo, useState } from "react";
import {
  ArrowLeftRight,
  ArrowRight,
  ChevronDown,
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
  isActivityGroup,
  summarizeActivityGroup,
  type ActivityGroup,
  type ActivityListItem,
} from "@/lib/audit/grouping";
import {
  describeAction,
  formatActivityRowDetails,
  formatActivityTime,
  formatActivityTimestamp,
  getActionSeverity,
  getAuditActorLabel,
  getAuditActorSecondaryLabel,
  getAuditCategoryLabel,
  getAuditTargetLabel,
  type ActivityRowDetails,
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
export function ActivityKindIcon({
  action,
  size = "md",
  tone,
}: {
  action: string;
  size?: "md" | "lg";
  /** Overrides the action's own tint, for a group mixing kinds of change. */
  tone?: StatusPillTone;
}) {
  const category = getAuditCategory(action);
  const Icon = category ? CATEGORY_ICONS[category] : CircleDot;
  return (
    <span
      className="dg-activity-kind-icon"
      data-size={size}
      data-tone={tone ?? ACTION_TONES[getActionSeverity(action)]}
    >
      <Icon size={size === "lg" ? 18 : 15} strokeWidth={2} aria-hidden />
    </span>
  );
}

/** The kind's name, colored like its icon. */
export function ActivityKindLabel({ action, tone }: { action: string; tone?: StatusPillTone }) {
  return (
    <div className="dg-activity-kind" data-tone={tone ?? ACTION_TONES[getActionSeverity(action)]}>
      {getAuditCategoryLabel(action)}
    </div>
  );
}

/** A group shares its members' tint only when they are all the same change. */
export function activityGroupTone(group: ActivityGroup<{ action: string }>): StatusPillTone {
  const action = group.members[0].action;
  return group.members.every((member) => member.action === action)
    ? ACTION_TONES[getActionSeverity(action)]
    : "neutral";
}

/** "2:09 - 2:16 PM", or one time when the run fit in a minute. */
export function formatActivityGroupTime(
  group: ActivityGroup<unknown>,
  timeZone: string | null,
): string {
  const start = formatActivityTime(group.startedAt, timeZone);
  const end = formatActivityTime(group.createdAt, timeZone);
  if (start === end) return end;
  const startSuffix = start.slice(-3);
  return `${startSuffix === end.slice(-3) ? start.slice(0, -3) : start} - ${end}`;
}

export function ActivityRowDetailLines({ change, details }: ActivityRowDetails) {
  return (
    <>
      {change && (
        <div className="dg-activity-change">
          {change.before === null ? (
            <span className="dg-activity-change-new">New</span>
          ) : (
            <>
              <span className="dg-activity-change-before">{change.before}</span>
              <ArrowRight
                className="dg-activity-change-arrow"
                size={12}
                strokeWidth={2.25}
                aria-label="changed to"
              />
            </>
          )}
          <span>{change.after}</span>
        </div>
      )}
      {details.length > 0 && (
        <div className="dg-activity-detail-list">
          {details.map((item) => (
            <span className="dg-activity-detail" key={`${item.label}:${item.value}`}>
              <span className="dg-activity-detail-key">{item.label}:</span> {item.value}
            </span>
          ))}
        </div>
      )}
    </>
  );
}

/** Opens the details for one entry, or for a group of them. */
export function ActivityItemDialog({
  item,
  ...props
}: {
  item: ActivityListItem<ActivityEntryLike>;
  onClose: () => void;
  timeZone?: string | null;
  showOrganization?: boolean;
}) {
  return isActivityGroup(item) ? (
    <ActivityGroupDialog group={item} {...props} />
  ) : (
    <ActivityDetailsDialog entry={item} {...props} />
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
            <EmptyState size="inline" title="No additional details were recorded." />
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

const SEARCH_FROM = 8;

function ActivityGroupDialog({
  group,
  onClose,
  timeZone = null,
  showOrganization = false,
}: {
  group: ActivityGroup<ActivityEntryLike>;
  onClose: () => void;
  timeZone?: string | null;
  showOrganization?: boolean;
}) {
  const summary = summarizeActivityGroup(group, describeAction);
  const newest = group.members[0];
  const tone = activityGroupTone(group);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  const targets = useMemo(() => {
    const byTarget = new Map<string, ActivityEntryLike[]>();
    for (const member of group.members) {
      const label = getAuditTargetLabel(member);
      byTarget.set(label, [...(byTarget.get(label) ?? []), member]);
    }
    return [...byTarget.entries()].sort(
      ([a, left], [b, right]) => right.length - left.length || a.localeCompare(b),
    );
  }, [group.members]);
  const search = query.trim().toLowerCase();
  const shown = search
    ? targets.filter(([label]) => label.toLowerCase().includes(search))
    : targets;
  const unit = summary.isScheduleEdit ? ["shift", "shifts"] : ["change", "changes"];
  const organization = showOrganization
    ? (newest.orgName ?? (newest.orgId ? "Unknown organization" : "Platform-wide"))
    : null;

  return (
    <Modal
      title="Activity details"
      heading={
        <div className="dg-activity-details-heading">
          <ActivityKindIcon action={newest.action} size="lg" tone={tone} />
          <div className="dg-activity-details-titles">
            <ActivityKindLabel action={newest.action} tone={tone} />
            <h2 className="dg-activity-details-headline">{summary.headline}</h2>
            <div className="dg-activity-details-meta">
              {organization ? (
                <>
                  <span>{organization}</span>
                  <span aria-hidden>·</span>
                </>
              ) : null}
              <span>
                {formatActivityTimestamp(group.startedAt, timeZone)} to{" "}
                {formatActivityTime(group.createdAt, timeZone)}
              </span>
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
            primary={getAuditActorLabel(newest)}
            secondary={getAuditActorSecondaryLabel(newest)}
          />
          <ActivityDetailPerson label="Affected" primary={summary.affected} />
        </div>
        {summary.isScheduleEdit ? (
          <div className="dg-activity-group-totals">
            {(
              [
                ["Added", summary.added],
                ["Changed", summary.changed],
                ["Removed", summary.removed],
              ] as const
            ).map(([label, count]) => (
              <div key={label} className="dg-activity-group-total">
                <span className="dg-activity-group-total-count">{count}</span>
                <span className="dg-activity-details-label">{label}</span>
              </div>
            ))}
          </div>
        ) : null}
        <section className="dg-activity-details-changes" aria-labelledby="activity-group-title">
          <h3 id="activity-group-title" className="dg-type-content-group-heading">
            What changed
          </h3>
          {targets.length >= SEARCH_FROM ? (
            <input
              type="search"
              className="dg-input"
              placeholder="Find a name"
              aria-label="Find a name"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          ) : null}
          <ul className="dg-activity-group-targets">
            {shown.map(([label, members]) => {
              const expanded = open === label;
              return (
                <li key={label} className="dg-activity-group-target">
                  <button
                    type="button"
                    className="dg-activity-group-target-toggle"
                    aria-expanded={expanded}
                    onClick={() => setOpen(expanded ? null : label)}
                  >
                    <span className="dg-activity-details-identity-primary">{label}</span>
                    <span className="dg-activity-group-target-count">
                      {members.length} {members.length === 1 ? unit[0] : unit[1]}
                    </span>
                    <ChevronDown
                      className="dg-activity-group-target-chevron"
                      size={14}
                      strokeWidth={2.25}
                      aria-hidden
                    />
                  </button>
                  {expanded ? (
                    <ul className="dg-activity-group-members">
                      {members.map((member, index) => (
                        <li key={`${member.createdAt}:${index}`}>
                          <div className="dg-activity-description">{describeAction(member)}</div>
                          <ActivityRowDetailLines {...formatActivityRowDetails(member)} />
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              );
            })}
            {shown.length === 0 ? (
              <li className="dg-activity-details-empty">No one matches that name.</li>
            ) : null}
          </ul>
        </section>
      </div>
    </Modal>
  );
}
