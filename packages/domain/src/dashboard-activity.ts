import { getOrgRoleLabel } from "./org-roles";
import { formatShiftRequestStatusLabel } from "./requests";

/**
 * Copy for the dashboard "Recent activity" feed, shared by web and mobile so
 * a publish, a request, or a new member reads the same on both.
 */

export type PublishChangeKind = "new" | "modified" | "deleted";

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

/**
 * One phrase for what a publish changed: "3 shifts added, 1 updated, 2 removed".
 * With no per-cell detail, falls back to the bare count the publish recorded.
 */
export function summarizePublishChanges(
  changes: ReadonlyArray<{ kind: PublishChangeKind }>,
  changeCount?: number,
): string {
  let added = 0;
  let updated = 0;
  let removed = 0;
  for (const change of changes) {
    if (change.kind === "new") added += 1;
    else if (change.kind === "modified") updated += 1;
    else removed += 1;
  }
  const counted: Array<[number, string]> = [
    [added, "added"] as [number, string],
    [updated, "updated"] as [number, string],
    [removed, "removed"] as [number, string],
  ].filter(([count]) => count > 0);
  if (counted.length === 0) {
    return changeCount && changeCount > 0 ? plural(changeCount, "change") : "No shift changes";
  }
  // The first phrase names the unit; the rest read as "1 updated, 2 removed".
  return counted
    .map(([count, verb], index) =>
      index === 0 ? `${plural(count, "shift")} ${verb}` : `${count} ${verb}`,
    )
    .join(", ");
}

export function describeShiftRequestActivity(input: {
  type: string;
  shiftName: string;
  requesterName: string;
  status: string;
}): string {
  const status = formatShiftRequestStatusLabel(input.status);
  if (input.type === "pickup") return `Pickup request · ${input.shiftName} · ${status}`;
  if (input.type === "calloff") return `Call-off request · ${input.requesterName} · ${status}`;
  return `Swap request · ${input.requesterName} · ${status}`;
}

export function describeMemberSignupActivity(input: { email: string; role: string }): string {
  return `New member · ${input.email} · ${getOrgRoleLabel(input.role)}`;
}
