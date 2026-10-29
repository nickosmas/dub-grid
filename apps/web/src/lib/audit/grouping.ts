import { formatDate } from "@dubgrid/schedule-core";
import { getAuditCategory } from "./registry";

/** The fields that decide whether two activity entries belong to one run. */
export interface GroupableActivity {
  action: string;
  actorId: string | null;
  orgId: string | null;
  createdAt: string;
}

/** A run of the same kind of change by one person, shown as one entry. */
export interface ActivityGroup<T> {
  kind: "group";
  id: string;
  /** The newest member's time, so the group sorts and files like an entry. */
  createdAt: string;
  startedAt: string;
  /** Newest first, as the log lists them. */
  members: T[];
}

export type ActivityListItem<T> = T | ActivityGroup<T>;

/** Fewer than this many in a row read fine as separate rows. */
export const MIN_GROUP_SIZE = 3;
/** A pause longer than this ends a run, even with nothing in between. */
export const MAX_GROUP_GAP_MS = 5 * 60_000;

// Auto-build, recurring fills, paste and bulk delete save one cell at a time,
// mixing adds, changes and removals; they are one piece of work.
const SCHEDULE_CELL_ACTIONS = new Set([
  "shift.created",
  "shift.updated",
  "shift.deleted",
  "shift.moved",
]);
// Each carries its own reason or marks a moment people look for on its own.
const NEVER_GROUPED = new Set(["shift.corrected", "schedule.published"]);

export function isActivityGroup<T>(item: ActivityListItem<T>): item is ActivityGroup<T> {
  return (item as ActivityGroup<T>).kind === "group" && "members" in (item as object);
}

function runKey(entry: GroupableActivity): string | null {
  if (NEVER_GROUPED.has(entry.action)) return null;
  const family = SCHEDULE_CELL_ACTIONS.has(entry.action) ? "schedule.cells" : entry.action;
  return `${entry.orgId ?? ""}|${entry.actorId ?? "system"}|${family}`;
}

function continuesRun(previous: GroupableActivity, next: GroupableActivity): boolean {
  const key = runKey(previous);
  if (key === null || key !== runKey(next)) return false;
  const gap = Math.abs(Date.parse(previous.createdAt) - Date.parse(next.createdAt));
  return gap <= MAX_GROUP_GAP_MS;
}

/**
 * Splits a newest-first list into runs: entries next to each other with the
 * same kind, person and organization, each within a few minutes of the last.
 * Runs too short to group come back as one-entry runs.
 */
export function splitActivityRuns<T extends GroupableActivity>(entries: T[]): T[][] {
  const runs: T[][] = [];
  let current: T[] = [];
  for (const entry of entries) {
    const last = current[current.length - 1];
    if (last && continuesRun(last, entry)) {
      current.push(entry);
      continue;
    }
    pushRun(runs, current);
    current = [entry];
  }
  pushRun(runs, current);
  return runs;
}

function pushRun<T>(runs: T[][], run: T[]) {
  if (run.length === 0) return;
  if (run.length >= MIN_GROUP_SIZE) runs.push(run);
  else for (const entry of run) runs.push([entry]);
}

export function groupActivityEntries<T extends GroupableActivity & { id: string | number }>(
  entries: T[],
): ActivityListItem<T>[] {
  return splitActivityRuns(entries).map((run) =>
    run.length === 1 ? run[0] : toActivityGroup(run),
  );
}

export function toActivityGroup<T extends GroupableActivity & { id: string | number }>(
  members: T[],
): ActivityGroup<T> {
  return {
    kind: "group",
    id: `group:${members[0].id}`,
    createdAt: members[0].createdAt,
    startedAt: members[members.length - 1].createdAt,
    members,
  };
}

/** Every entry a list holds, groups opened up, for totals that count events. */
export function flattenActivityItems<T>(items: ActivityListItem<T>[]): T[] {
  return items.flatMap((item) => (isActivityGroup(item) ? item.members : [item]));
}

interface DescribableMember extends GroupableActivity {
  resourceId?: string | null;
  targetLabel?: string | null;
}

export interface ActivityGroupSummary {
  headline: string;
  /** Short counts such as "81 added", in reading order, zeros left out. */
  counts: string[];
  /** Who or what the run touched: one name, or how many. */
  affected: string;
  isScheduleEdit: boolean;
  added: number;
  changed: number;
  removed: number;
}

const PERSON_CATEGORIES = new Set(["people", "schedule", "requests", "invitations", "access"]);

function cellDate(resourceId: string | null | undefined): string | null {
  return /:(\d{4}-\d{2}-\d{2})$/.exec(resourceId ?? "")?.[1] ?? null;
}

function formatDayRange(dates: string[]): string | null {
  if (dates.length === 0) return null;
  const sorted = [...dates].sort();
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const withYear = { month: "short", day: "numeric", year: "numeric" } as const;
  if (first === last) return formatDate(first, withYear);
  const sameYear = first.slice(0, 4) === last.slice(0, 4);
  const start = formatDate(first, sameYear ? { month: "short", day: "numeric" } : withYear);
  return `${start} - ${formatDate(last, withYear)}`;
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/**
 * The words a group reads with. `describeMember` is the single-entry headline,
 * passed in so this module stays free of the registry's context resolution.
 */
export function summarizeActivityGroup<T extends DescribableMember>(
  group: ActivityGroup<T>,
  describeMember: (member: T) => string,
): ActivityGroupSummary {
  const { members } = group;
  const isScheduleEdit = SCHEDULE_CELL_ACTIONS.has(members[0].action);
  const targets = new Set(members.map((member) => member.targetLabel ?? "").filter(Boolean));
  const category = getAuditCategory(members[0].action);
  const noun =
    category && PERSON_CATEGORIES.has(category) ? ["person", "people"] : ["item", "items"];
  const affected =
    targets.size === 1 ? [...targets][0] : plural(targets.size || members.length, noun[0], noun[1]);

  if (!isScheduleEdit) {
    return {
      headline: `${describeMember(members[0])} and ${members.length - 1} more`,
      counts: [
        plural(members.length, "change", "changes"),
        ...(targets.size > 1 ? [affected] : []),
      ],
      affected,
      isScheduleEdit,
      added: 0,
      changed: 0,
      removed: 0,
    };
  }

  const added = members.filter((member) => member.action === "shift.created").length;
  const removed = members.filter((member) => member.action === "shift.deleted").length;
  const changed = members.length - added - removed;
  const range = formatDayRange(
    members.map((member) => cellDate(member.resourceId)).filter((date): date is string => !!date),
  );
  return {
    headline: range ? `Edited the draft for ${range}` : "Edited the draft",
    counts: [
      plural(members.length, "shift", "shifts"),
      ...(targets.size > 1 ? [affected] : []),
      ...(added ? [`${added} added`] : []),
      ...(changed ? [`${changed} changed`] : []),
      ...(removed ? [`${removed} removed`] : []),
    ],
    affected,
    isScheduleEdit,
    added,
    changed,
    removed,
  };
}
