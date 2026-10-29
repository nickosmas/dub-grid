import { describe, expect, it } from "vitest";
import { collectGroupedPage } from "./grouped-page";
import {
  flattenActivityItems,
  groupActivityEntries,
  isActivityGroup,
  splitActivityRuns,
  summarizeActivityGroup,
  toActivityGroup,
} from "./grouping";

interface Entry {
  id: number;
  action: string;
  actorId: string | null;
  orgId: string | null;
  createdAt: string;
  resourceId?: string | null;
  targetLabel?: string | null;
}

let nextId = 1;
function entry(action: string, minute: number, overrides: Partial<Entry> = {}): Entry {
  return {
    id: nextId++,
    action,
    actorId: "dana",
    orgId: "org-1",
    // Newest first, as the log lists them: a higher minute is earlier.
    createdAt: new Date(Date.UTC(2026, 9, 29, 14, 0) - minute * 60_000).toISOString(),
    ...overrides,
  };
}

describe("splitActivityRuns", () => {
  it("joins adds, changes and removals of shifts by one person into one run", () => {
    const runs = splitActivityRuns([
      entry("shift.created", 0),
      entry("shift.deleted", 1),
      entry("shift.updated", 2),
      entry("shift.moved", 3),
    ]);
    expect(runs.map((run) => run.length)).toEqual([4]);
  });

  it("keeps fewer than three in a row as separate entries", () => {
    const runs = splitActivityRuns([entry("shift.created", 0), entry("shift.created", 1)]);
    expect(runs.map((run) => run.length)).toEqual([1, 1]);
  });

  it("ends a run at another person, another kind, another organization or a long pause", () => {
    const runs = splitActivityRuns([
      entry("employee.deactivated", 0),
      entry("employee.deactivated", 1),
      entry("employee.deactivated", 2),
      entry("employee.deactivated", 3, { actorId: "jordan" }),
      entry("invitation.sent", 4),
      entry("employee.deactivated", 5, { orgId: "org-2" }),
      entry("employee.deactivated", 6),
      entry("employee.deactivated", 7),
      entry("employee.deactivated", 13),
    ]);
    expect(runs.map((run) => run.length)).toEqual([3, 1, 1, 1, 1, 1, 1]);
  });

  it("never groups corrections or publishes, which stand on their own", () => {
    const runs = splitActivityRuns([
      entry("shift.corrected", 0),
      entry("shift.corrected", 1),
      entry("shift.corrected", 2),
      entry("schedule.published", 3),
      entry("schedule.published", 4),
      entry("schedule.published", 5),
    ]);
    expect(runs.every((run) => run.length === 1)).toBe(true);
  });
});

describe("groupActivityEntries", () => {
  it("returns groups beside single entries, and flattening gives every entry back", () => {
    const entries = [
      entry("schedule.published", 0),
      entry("shift.created", 1),
      entry("shift.created", 2),
      entry("shift.created", 3),
    ];
    const items = groupActivityEntries(entries);

    expect(items).toHaveLength(2);
    expect(isActivityGroup(items[0])).toBe(false);
    const group = items[1];
    expect(isActivityGroup(group) && group.members).toHaveLength(3);
    expect(isActivityGroup(group) && group.startedAt).toBe(entries[3].createdAt);
    expect(flattenActivityItems(items)).toEqual(entries);
  });
});

describe("summarizeActivityGroup", () => {
  it("names a run of shift edits by its days, shifts, people and kinds", () => {
    const group = toActivityGroup([
      entry("shift.created", 0, { resourceId: "e1:2026-11-15", targetLabel: "Ana Torres" }),
      entry("shift.created", 1, { resourceId: "e2:2026-11-02", targetLabel: "Leo Grant" }),
      entry("shift.deleted", 2, { resourceId: "e1:2026-11-04", targetLabel: "Ana Torres" }),
      entry("shift.updated", 3, { resourceId: "e3:2026-11-05", targetLabel: "Priya Shah" }),
    ]);

    const summary = summarizeActivityGroup(group, () => "unused");
    expect(summary.headline).toBe("Edited the draft for Nov 2 - Nov 15, 2026");
    expect(summary.counts).toEqual(["4 shifts", "3 people", "2 added", "1 changed", "1 removed"]);
    expect(summary.affected).toBe("3 people");
  });

  it("reads any other run as its newest headline and how many more", () => {
    const group = toActivityGroup([
      entry("employee.deactivated", 0, { targetLabel: "Carol Henderson" }),
      entry("employee.deactivated", 1, { targetLabel: "Thomas Crawford" }),
      entry("employee.deactivated", 2, { targetLabel: "Diane Patterson" }),
    ]);

    const summary = summarizeActivityGroup(group, (member) => `Marked ${member.targetLabel} away`);
    expect(summary.headline).toBe("Marked Carol Henderson away and 2 more");
    expect(summary.counts).toEqual(["3 changes", "3 people"]);
  });

  it("names the one person a run touched", () => {
    const group = toActivityGroup([
      entry("shift.created", 0, { resourceId: "e1:2026-11-03", targetLabel: "Ana Torres" }),
      entry("shift.created", 1, { resourceId: "e1:2026-11-04", targetLabel: "Ana Torres" }),
      entry("shift.created", 2, { resourceId: "e1:2026-11-05", targetLabel: "Ana Torres" }),
    ]);

    const summary = summarizeActivityGroup(group, () => "unused");
    expect(summary.affected).toBe("Ana Torres");
    expect(summary.counts).toEqual(["3 shifts", "3 added"]);
  });
});

describe("collectGroupedPage", () => {
  function rawRows(count: number, action = "shift.created") {
    return Array.from({ length: count }, (_, index) => ({
      id: index,
      action,
      actor_id: "dana",
      org_id: "org-1",
      created_at: new Date(Date.UTC(2026, 9, 29, 14, 0) - index * 1000).toISOString(),
    }));
  }

  it("reads past one chunk to finish the run that ends the page", async () => {
    const rows = [
      ...rawRows(1, "schedule.published"),
      ...rawRows(700).map((row) => ({ ...row, id: row.id + 1 })),
      { ...rawRows(1, "invitation.sent")[0], id: 999, created_at: "2026-10-29T12:00:00.000Z" },
    ];
    const fetchRows = async (offset: number, limit: number) => rows.slice(offset, offset + limit);

    const page = await collectGroupedPage(fetchRows, { offset: 0, limit: 2 });

    // The publish, then all 700 edits as one entry; the invitation starts page two.
    expect(page.rows).toHaveLength(701);
    expect(page.nextOffset).toBe(701);
  });

  it("has no next page once the rows run out", async () => {
    const rows = rawRows(4, "invitation.sent").map((row, index) => ({
      ...row,
      actor_id: `person-${index}`,
    }));
    const fetchRows = async (offset: number, limit: number) => rows.slice(offset, offset + limit);

    expect(await collectGroupedPage(fetchRows, { offset: 0, limit: 10 })).toEqual({
      rows,
      nextOffset: null,
    });
  });
});
