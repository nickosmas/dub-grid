import { describe, expect, it } from "vitest";
import {
  formatActivityTime,
  formatActivityTimestamp,
  formatDetails,
  getAuditActorLabel,
  getAuditActorSecondaryLabel,
  groupByDay,
  summarizeCategories,
  summarizeDetails,
} from "@/lib/activity-log-utils";
import type { FullAuditLogEntry } from "@/types";

function makeEntry(overrides: Partial<FullAuditLogEntry>): FullAuditLogEntry {
  return {
    id: 1,
    orgId: "11111111-1111-4111-8111-111111111111",
    orgName: "Arden Wood",
    actorId: "22222222-2222-4222-8222-222222222222",
    actorEmail: "admin@example.com",
    actorName: "Jordan Admin",
    action: "gridmaster_account.deactivated",
    resourceType: "user",
    resourceId: "33333333-3333-4333-8333-333333333333",
    targetLabel: "Nico Gridmaster",
    targetEmail: "nico@example.com",
    details: {},
    createdAt: "2026-05-01T15:00:00.000Z",
    ...overrides,
  };
}

describe("activity log display formatting", () => {
  it("formats audit detail keys and values in client-friendly language", () => {
    const entry = makeEntry({
      details: {
        initiated_by: "gridmaster",
        targetUserId: "33333333-3333-4333-8333-333333333333",
        deactivate: true,
        orgRole: "super_admin",
        startDate: "2026-05-04",
      },
    });

    expect(formatDetails(entry)).toEqual([
      { label: "Status change", value: "Deactivate account" },
      { label: "Organization role", value: "Super Admin" },
      { label: "Start date", value: "May 4, 2026" },
    ]);
    expect(summarizeDetails(entry)).toBe(
      "Status change: Deactivate account · Organization role: Super Admin · Start date: May 4, 2026",
    );
  });

  it("labels gridmaster-initiated activity without showing the gridmaster email", () => {
    const entry = makeEntry({
      actorEmail: "gridmaster@example.com",
      actorName: "Nico Gridmaster",
      details: { initiated_by: "gridmaster" },
    });

    expect(getAuditActorLabel(entry)).toBe("Gridmaster");
    expect(getAuditActorSecondaryLabel(entry)).toBeNull();
  });

  it("shows readable before and after values for employee reference changes", () => {
    const entry = makeEntry({
      action: "employee.updated",
      details: {
        changedFields: ["certification", "roles", "focusAreas", "departments"],
        from: {
          certification: "Certified Nursing Assistant",
          roles: ["Caregiver"],
          focusAreas: ["Memory care"],
          departments: ["East wing"],
        },
        to: {
          certification: "Registered Nurse",
          roles: ["Charge nurse"],
          focusAreas: ["Rehabilitation"],
          departments: ["West wing"],
        },
      },
    });

    expect(formatDetails(entry)).toEqual([
      { label: "Certification", value: "Certified Nursing Assistant → Registered Nurse" },
      { label: "Roles", value: "Caregiver → Charge Nurse" },
      { label: "Focus Areas", value: "Memory care → Rehabilitation" },
      { label: "Departments", value: "East wing → West wing" },
    ]);
  });

  it("shows the exact certification rename when a saved list entry is opened", () => {
    const entry = makeEntry({
      action: "certifications.saved",
      details: {
        created: 0,
        updated: 1,
        archived: 0,
        changes: [
          {
            field: "name",
            label: "Certification name",
            from: "Nurse",
            to: "Staff",
          },
        ],
      },
    });

    expect(formatDetails(entry)).toEqual([{ label: "Certification name", value: "Nurse → Staff" }]);
  });

  it("keeps every client-readable item in a changed list", () => {
    const entry = makeEntry({
      details: {
        roles: [
          "Caregiver",
          "Medication aide",
          "Scheduler",
          "Trainer",
          "Mentor",
          "Supervisor",
          "On-call",
        ],
      },
    });

    expect(formatDetails(entry)).toEqual([
      {
        label: "Roles",
        value: "Caregiver, Medication Aide, Scheduler, Trainer, Mentor, Supervisor, On Call",
      },
    ]);
  });

  it("uses the Reports name instead of a stored report identifier", () => {
    const entry = makeEntry({ details: { report: "staff-hours" } });

    expect(formatDetails(entry)).toEqual([{ label: "Report", value: "Staff hours" }]);
  });
});

const NEW_YORK = "America/New_York";

describe("groupByDay", () => {
  it("buckets by the organization's calendar day, not the reader's", () => {
    // 10:30 PM on Sep 5 in New York, already Sep 6 in UTC.
    const entries = [{ createdAt: "2026-09-06T02:30:00.000Z" }];

    expect(groupByDay(entries, { timeZone: NEW_YORK, todayDate: "2026-09-06" })[0].dateKey).toBe(
      "2026-09-05",
    );
    expect(groupByDay(entries, { timeZone: null, todayDate: "2026-09-06" })[0].dateKey).toBe(
      "2026-09-06",
    );
  });

  it("labels days relative to the supplied today, not the wall clock", () => {
    const groups = groupByDay(
      [
        { createdAt: "2026-09-06T15:00:00.000Z" },
        { createdAt: "2026-09-05T15:00:00.000Z" },
        { createdAt: "2026-09-02T15:00:00.000Z" },
      ],
      { timeZone: "UTC", todayDate: "2026-09-06" },
    );

    expect(groups.map((group) => group.label)).toEqual([
      "Today",
      "Yesterday",
      "Wednesday, September 2, 2026",
    ]);
  });

  it("returns days newest first and keeps each day's entries in order", () => {
    const groups = groupByDay(
      [
        { createdAt: "2026-09-02T15:00:00.000Z", id: "old" },
        { createdAt: "2026-09-06T15:00:00.000Z", id: "newest" },
        { createdAt: "2026-09-06T09:00:00.000Z", id: "earlier-today" },
      ],
      { timeZone: "UTC", todayDate: "2026-09-06" },
    );

    expect(groups.map((group) => group.dateKey)).toEqual(["2026-09-06", "2026-09-02"]);
    expect(groups[0].entries.map((entry) => entry.id)).toEqual(["newest", "earlier-today"]);
  });

  it("has no groups for an empty list", () => {
    expect(groupByDay([], { timeZone: "UTC", todayDate: "2026-09-06" })).toEqual([]);
  });
});

describe("summarizeCategories", () => {
  it("counts categories, most frequent first", () => {
    expect(
      summarizeCategories([
        { action: "role.changed" },
        { action: "employee.updated" },
        { action: "permissions.updated" },
        { action: "employee.created" },
        { action: "organization_access.updated" },
      ]),
    ).toEqual([
      { value: "access", label: "Access & roles", count: 3 },
      { value: "people", label: "People", count: 2 },
    ]);
  });

  it("returns nothing for no entries", () => {
    expect(summarizeCategories([])).toEqual([]);
  });
});

describe("activity timestamps", () => {
  it("shows the clock time in the organization's zone", () => {
    expect(formatActivityTime("2026-09-07T02:21:00.000Z", NEW_YORK)).toBe("10:21 PM");
    expect(formatActivityTime("2026-09-07T02:21:00.000Z", null)).toBe("2:21 AM");
  });

  it("names the zone in the full timestamp", () => {
    expect(formatActivityTimestamp("2026-09-02T14:21:00.000Z", NEW_YORK)).toBe(
      "Sep 2, 2026, 10:21 AM EDT",
    );
  });

  it("passes an unparseable value through rather than printing Invalid Date", () => {
    expect(formatActivityTime("not a date", "UTC")).toBe("not a date");
    expect(formatActivityTimestamp("not a date", "UTC")).toBe("not a date");
  });
});
