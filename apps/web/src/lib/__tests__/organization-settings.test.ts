import { describe, expect, it } from "vitest";
import {
  buildOrganizationSettingsChanges,
  formatOrganizationSettingsValue,
  pickOrganizationSettings,
} from "@/lib/organization-settings";
import type { Organization } from "@/types";

function makeOrganization(overrides: Partial<Organization> = {}): Organization {
  return {
    id: "org-1",
    name: "Test Org",
    slug: "test-org",
    address: "",
    addressLine1: "",
    addressLine2: "",
    addressCity: "",
    addressState: "",
    addressPostalCode: "",
    addressCountry: "",
    phone: "",
    employeeCount: null,
    focusAreaLabel: "Focus Areas",
    certificationLabel: "Certifications",
    roleLabel: "Roles",
    departmentLabel: "Scheduled Departments",
    shiftDisplayMode: "code",
    timezone: "UTC",
    payPeriodStartDate: null,
    workspaceKind: "real",
    sandboxOwnerUserId: null,
    sandboxSourceOrgId: null,
    enforceConflictPrevention: false,
    defaultShiftEnabled: true,
    coverageRuleConfig: { mentoredCoverageCreditPercent: 100 },
    openShiftVisibility: { coverageGap: "matched", calloff: "matched" },
    dataRetentionDays: 365,
    featureOverrides: {},
    updatedAt: "2026-05-25T00:00:00.000Z",
    ...overrides,
  };
}

describe("organization-settings open shift visibility", () => {
  it("detects a change to a single open-shift visibility mode", () => {
    const previous = pickOrganizationSettings(makeOrganization());
    const next = pickOrganizationSettings(
      makeOrganization({
        openShiftVisibility: { coverageGap: "always", calloff: "matched" },
      }),
    );

    const changes = buildOrganizationSettingsChanges(previous, next);
    const change = changes.find((c) => c.key === "openShiftVisibility");

    expect(change).toBeDefined();
    // String modes must survive normalization, not be coerced to booleans.
    expect(change?.nextValue).toEqual({
      coverageGap: "always",
      calloff: "matched",
    });
  });

  it("reports no change when both modes are unchanged", () => {
    const previous = pickOrganizationSettings(makeOrganization());
    const next = pickOrganizationSettings(makeOrganization());

    const changes = buildOrganizationSettingsChanges(previous, next);
    expect(changes.some((c) => c.key === "openShiftVisibility")).toBe(false);
  });

  it("formats the visibility setting for the audit trail", () => {
    expect(
      formatOrganizationSettingsValue("openShiftVisibility", {
        coverageGap: "always",
        calloff: "hidden",
      }),
    ).toBe("Coverage shortages: Always · Call-offs: Hidden");
  });
});
