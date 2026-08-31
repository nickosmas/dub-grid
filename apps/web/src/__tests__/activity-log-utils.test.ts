import { describe, expect, it } from "vitest";
import {
  formatDetails,
  getAuditActorLabel,
  getAuditActorSecondaryLabel,
  severityColor,
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

  it("uses accessible text tokens for category badges", () => {
    expect(severityColor("create").fg).toBe("var(--dg-color-success-text, #166534)");
    expect(severityColor("warning").fg).toBe("var(--dg-color-warning-text, #92400e)");
    expect(severityColor("delete").fg).toBe("var(--dg-color-danger-text, #b91c1c)");
  });

  it("uses the Reports name instead of a stored report identifier", () => {
    const entry = makeEntry({ details: { report: "staff-hours" } });

    expect(formatDetails(entry)).toEqual([{ label: "Report", value: "Staff hours" }]);
  });
});
