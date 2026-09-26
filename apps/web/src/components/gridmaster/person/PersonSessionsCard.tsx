"use client";

import type { ReactNode } from "react";
import { StatusPill } from "@/components/ui/status-pill";
import type {
  GridmasterCalendarFeed,
  GridmasterPersonRecord,
  GridmasterPushDevice,
  GridmasterSession,
} from "@/features/gridmaster/person-record";
import { PersonSection, PersonSubheading } from "./PersonField";
import { formatDay, formatMoment } from "./person-format";

function orgName(record: GridmasterPersonRecord, orgId: string | null): string | null {
  if (!orgId) return null;
  return (
    record.organizations.find((organization) => organization.org.id === orgId)?.org.name ?? null
  );
}

function Row({
  primary,
  secondary,
  actions,
}: {
  primary: ReactNode;
  secondary: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 py-2.5 first:pt-0 last:pb-0">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-[13px] text-[var(--dg-color-text-primary)]">{primary}</span>
        <span className="dg-tabular-nums text-[12px] text-[var(--dg-color-text-muted)]">
          {secondary}
        </span>
      </div>
      {actions ? <div className="flex gap-2">{actions}</div> : null}
    </li>
  );
}

function List({ empty, children }: { empty: string; children: ReactNode[] }) {
  if (children.length === 0) {
    return <p className="text-[13px] text-[var(--dg-color-text-muted)]">{empty}</p>;
  }
  return (
    <ul className="flex flex-col divide-y divide-[var(--dg-color-border-light)]">{children}</ul>
  );
}

/** Every session, push device and calendar feed, with the action that ends each. */
export function PersonSessionsCard({
  record,
  renderSessionActions,
  renderPushActions,
  renderFeedActions,
}: {
  record: GridmasterPersonRecord;
  renderSessionActions?: (session: GridmasterSession) => ReactNode;
  renderPushActions?: (device: GridmasterPushDevice) => ReactNode;
  renderFeedActions?: (feed: GridmasterCalendarFeed) => ReactNode;
}) {
  const { sessions } = record;
  if (!sessions) return null;

  return (
    <PersonSection
      title="Sessions and devices"
      description="Where they are signed in, the phones that get their alerts, and their calendar feeds."
    >
      <PersonSubheading>Sessions</PersonSubheading>
      <List empty="No sessions.">
        {sessions.sessions.map((session) => (
          <Row
            key={session.id}
            primary={
              [
                session.deviceLabel,
                session.browser,
                session.appVersion && `app ${session.appVersion}`,
              ]
                .filter(Boolean)
                .join(" · ") ||
              session.platform ||
              "Unknown device"
            }
            secondary={[
              session.platform,
              orgName(record, session.orgId),
              session.location,
              `started ${formatDay(session.createdAt)}`,
              session.lastActiveAt ? `active ${formatMoment(session.lastActiveAt)}` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
            actions={renderSessionActions?.(session)}
          />
        ))}
      </List>

      <PersonSubheading>Push devices</PersonSubheading>
      <List empty="No push devices.">
        {sessions.pushDevices.map((device) => (
          <Row
            key={device.id}
            primary={
              <span className="inline-flex items-center gap-2">
                {device.platform}
                {device.disabledAt ? (
                  <StatusPill tone="neutral">Off since {formatDay(device.disabledAt)}</StatusPill>
                ) : null}
              </span>
            }
            secondary={[
              orgName(record, device.orgId),
              `registered ${formatDay(device.createdAt)}`,
              device.lastSeenAt ? `seen ${formatMoment(device.lastSeenAt)}` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
            actions={device.disabledAt ? undefined : renderPushActions?.(device)}
          />
        ))}
      </List>

      <PersonSubheading>Calendar feeds</PersonSubheading>
      <List empty="No calendar feeds.">
        {sessions.calendarFeeds.map((feed) => (
          <Row
            key={feed.id}
            primary={
              <span className="inline-flex items-center gap-2">
                {orgName(record, feed.orgId) ?? "Calendar feed"}
                {feed.revokedAt ? (
                  <StatusPill tone="neutral">Revoked {formatDay(feed.revokedAt)}</StatusPill>
                ) : null}
              </span>
            }
            secondary={`issued ${formatDay(feed.issuedAt)}`}
            actions={feed.revokedAt ? undefined : renderFeedActions?.(feed)}
          />
        ))}
      </List>
    </PersonSection>
  );
}
