import { describe, expect, it } from "vitest";
import {
  formatDetails,
  getAuditActorLabel,
  getAuditActorSecondaryLabel,
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
      { label: "Start date", value: "May 4" },
    ]);
    expect(summarizeDetails(entry)).toBe(
      "Status change: Deactivate account · Organization role: Super Admin · Start date: May 4",
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
});
