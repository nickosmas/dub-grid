import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * F-75: a route that changes an organization's schedule, requests or settings
 * asks `requireOrgPermissions` to hold a Gridmaster who is not a member to an
 * active impersonation, as migration 075 does in the database. A new write
 * action that forgets the flag fails here.
 */

const API = path.resolve(__dirname, "../app/api");

/** Actions that only read, or touch the caller's own viewing state. */
const READS = new Set([
  "fetchShifts",
  "fetchScheduleNotes",
  "fetchCalloffOpenShifts",
  "getScheduleLastViewed",
  "updateScheduleLastViewed",
  "fetchRecurringShifts",
  "getRecurringDraft",
  "fetchShiftRequests",
]);

interface PermissionCall {
  file: string;
  action: string;
  call: string;
}

function permissionCalls(relative: string): PermissionCall[] {
  const source = readFileSync(path.join(API, relative), "utf8");
  const calls: PermissionCall[] = [];
  let action = "(route)";
  const pattern = /case "(\w+)"|(?:export )?async function (\w+)|requireOrgPermissions\(/g;
  for (const match of source.matchAll(pattern)) {
    if (match[1]) action = match[1];
    else if (match[2]) action = match[2];
    else {
      const start = match.index!;
      let depth = 0;
      let end = start;
      for (let index = source.indexOf("(", start); index < source.length; index += 1) {
        if (source[index] === "(") depth += 1;
        if (source[index] === ")") depth -= 1;
        if (depth === 0) {
          end = index;
          break;
        }
      }
      calls.push({ file: relative, action, call: source.slice(start, end + 1) });
    }
  }
  return calls.filter(
    (call) => !call.call.startsWith("requireOrgPermissions(\n  req: NextRequest"),
  );
}

const ROUTES = [
  "schedule/manage/route.ts",
  "schedule/recurring/route.ts",
  "schedule/requests/route.ts",
  "shifts/publish/route.ts",
];

describe("Gridmaster writes through the routes need an impersonation (F-75)", () => {
  it.each(ROUTES)("%s flags every write action", (route) => {
    const writes = permissionCalls(route).filter((call) => !READS.has(call.action));
    expect(writes.length).toBeGreaterThan(0);
    const unflagged = writes
      .filter((call) => !call.call.includes("gridmasterNeedsImpersonation: true"))
      .map((call) => `${call.file} ${call.action}`);
    expect(unflagged).toEqual([]);
  });

  it("leaves the read actions open", () => {
    const flaggedReads = ROUTES.flatMap(permissionCalls)
      .filter((call) => READS.has(call.action))
      .filter((call) => call.call.includes("gridmasterNeedsImpersonation"))
      .map((call) => `${call.file} ${call.action}`);
    expect(flaggedReads).toEqual([]);
  });

  it("flags settings changes, not settings reads", () => {
    const [call] = permissionCalls("settings/config/route.ts");
    expect(call?.call).toContain('gridmasterNeedsImpersonation: permission.endsWith("Manage")');
  });
});
