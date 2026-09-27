"use client";

import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/Button";
import { StatusPill } from "@/components/ui/status-pill";
import { fetchGridmasterPersonNotifications } from "@/features/gridmaster/client";
import type { GridmasterPersonRecord } from "@/features/gridmaster/person-record";
import { queryKeys } from "@/lib/query-keys";
import { PersonSection, PersonSubheading } from "./PersonField";
import { formatMoment } from "./person-format";

function words(value: string): string {
  const spaced = value.replace(/_/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
}

/** A stored preference value as it reads: switches as On or Off, nested ones by name. */
function describePreference(value: unknown): string {
  if (typeof value === "boolean") return value ? "On" : "Off";
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const text = Object.entries(value as Record<string, unknown>)
      .map(([key, inner]) => `${words(key)} ${describePreference(inner)}`.toLowerCase())
      .join(", ");
    return text.charAt(0).toUpperCase() + text.slice(1);
  }
  if (Array.isArray(value)) return value.map(String).join(", ");
  return value === null || value === undefined ? "Not set" : String(value);
}

function orgName(record: GridmasterPersonRecord, orgId: string | null): string | null {
  if (!orgId) return null;
  return (
    record.organizations.find((organization) => organization.org.id === orgId)?.org.name ?? null
  );
}

/** The account's stored notification preferences and its latest notifications. */
export function PersonNotificationsCard({ record }: { record: GridmasterPersonRecord }) {
  const userId = record.account?.userId ?? null;
  const query = useQuery({
    queryKey: queryKeys.gridmaster.personNotifications(userId ?? ""),
    queryFn: () => fetchGridmasterPersonNotifications(userId!),
    enabled: userId !== null,
    staleTime: 30_000,
  });
  if (!userId) return null;

  return (
    <PersonSection
      title="Notifications"
      description="Their notification settings as stored, and the latest 50 notifications."
    >
      {query.isPending ? (
        <p className="text-[13px] text-[var(--dg-color-text-muted)]">Loading notifications</p>
      ) : query.isError ? (
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[13px] text-[var(--dg-color-danger-text)]">
            {query.error instanceof Error ? query.error.message : "We couldn't load notifications."}
          </p>
          <Button
            className="dg-btn dg-btn-secondary dg-btn-sm"
            onClick={() => void query.refetch()}
          >
            Try again
          </Button>
        </div>
      ) : (
        <>
          <PersonSubheading>Preferences</PersonSubheading>
          {query.data.notifications.preferences &&
          Object.keys(query.data.notifications.preferences).length > 0 ? (
            <dl className="grid gap-3 sm:grid-cols-2">
              {Object.entries(query.data.notifications.preferences).map(([key, value]) => (
                <div key={key} className="min-w-0">
                  <dt className="dg-type-field-title">{words(key)}</dt>
                  <dd className="mt-1 break-words text-[13px] text-[var(--dg-color-text-primary)]">
                    {describePreference(value)}
                  </dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="text-[13px] text-[var(--dg-color-text-muted)]">
              Never changed. They get the defaults.
            </p>
          )}

          <PersonSubheading>Recent notifications</PersonSubheading>
          {query.data.notifications.notifications.length === 0 ? (
            <p className="text-[13px] text-[var(--dg-color-text-muted)]">No notifications.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-[var(--dg-color-border-light)]">
              {query.data.notifications.notifications.map((notification) => (
                <li
                  key={notification.id}
                  className="flex flex-col gap-0.5 py-2.5 first:pt-0 last:pb-0"
                >
                  <div className="flex flex-wrap items-center gap-2 text-[13px] text-[var(--dg-color-text-primary)]">
                    <StatusPill tone={notification.readAt ? "neutral" : "info"}>
                      {notification.archivedAt
                        ? "Archived"
                        : notification.readAt
                          ? "Read"
                          : "Unread"}
                    </StatusPill>
                    {notification.title || words(notification.type)}
                  </div>
                  {notification.message ? (
                    <div className="text-[13px] text-[var(--dg-color-text-muted)]">
                      {notification.message}
                    </div>
                  ) : null}
                  <div className="dg-tabular-nums text-[12px] text-[var(--dg-color-text-muted)]">
                    {[
                      formatMoment(notification.createdAt),
                      orgName(record, notification.orgId),
                      words(notification.type),
                      notification.priority && notification.priority !== "normal"
                        ? `${notification.priority} priority`
                        : null,
                      notification.readAt ? `read ${formatMoment(notification.readAt)}` : null,
                      notification.archivedAt
                        ? `archived ${formatMoment(notification.archivedAt)}`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(", ")}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </PersonSection>
  );
}
