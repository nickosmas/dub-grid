import { beforeEach, describe, expect, it, vi } from "vitest";
import { saveOrganizationSetupConfig } from "@/components/gridmaster/organization-setup/persistence";
import type { Organization } from "@/types";

const updateOrganizationSettings = vi.fn();
const saveOrganizationSettingsWithRecovery = vi.fn();
const saveDepartments = vi.fn();
const saveFocusAreas = vi.fn();
const saveCertifications = vi.fn();
const saveOrganizationRoles = vi.fn();
const saveShiftCategories = vi.fn();
const saveJobDefinitions = vi.fn();

vi.mock("@/features/employees/client", () => ({
  insertEmployee: vi.fn(),
}));

vi.mock("@/features/gridmaster/client", () => ({
  createGridmasterOrganizationSetup: vi.fn(),
}));

vi.mock("@/features/organization/client", () => ({
  createOrganizationInvitation: vi.fn(),
  updateOrganizationSettings: (...args: unknown[]) => updateOrganizationSettings(...args),
  saveOrganizationSettingsWithRecovery: (...args: unknown[]) =>
    saveOrganizationSettingsWithRecovery(...args),
}));

vi.mock("@/features/settings/client", () => ({
  saveDepartments: (...args: unknown[]) => saveDepartments(...args),
  saveFocusAreas: (...args: unknown[]) => saveFocusAreas(...args),
  saveCertifications: (...args: unknown[]) => saveCertifications(...args),
  saveOrganizationRoles: (...args: unknown[]) => saveOrganizationRoles(...args),
  saveShiftCategories: (...args: unknown[]) => saveShiftCategories(...args),
  saveJobDefinitions: (...args: unknown[]) => saveJobDefinitions(...args),
}));

function makeOrganization(): Organization {
  return {
    id: "org-1",
    name: "Acme Health",
    slug: "acme-health",
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
    departmentLabel: "Departments",
    shiftDisplayMode: "code",
    timezone: "America/Los_Angeles",
    payPeriodStartDate: null,
    archivedAt: null,
    suspendedAt: null,
    suspendedReason: null,
    enforceConflictPrevention: false,
    defaultShiftEnabled: true,
    openShiftVisibility: { coverageGap: "matched", calloff: "matched" },
    stripeCustomerId: null,
    subscriptionStatus: "trialing",
    trialEndsAt: null,
    subscriptionSeats: null,
    dataRetentionDays: 365,
    featureOverrides: {},
    workspaceKind: "real",
    sandboxOwnerUserId: null,
    sandboxSourceOrgId: null,
  };
}

describe("saveOrganizationSetupConfig", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    saveDepartments.mockResolvedValue([
      {
        id: 10,
        orgId: "org-1",
        name: "Operations",
        abbr: "OPS",
        type: "scheduled",
        sortOrder: 0,
      },
    ]);
    saveFocusAreas.mockResolvedValue({
      upserts: [
        {
          ok: true,
          item: {
            id: 20,
            orgId: "org-1",
            departmentId: 10,
            name: "Emergency",
            color: null,
            sortOrder: 0,
          },
        },
      ],
      deletes: [],
    });
    saveShiftCategories.mockResolvedValue([
      {
        ok: true,
        item: {
          id: 30,
          orgId: "org-1",
          name: "Day",
          abbr: "DAY",
          startTime: "07:00",
          endTime: "19:00",
          color: "#E2E8F0",
          sortOrder: 0,
          focusAreaId: 20,
          breakMinutes: null,
        },
      },
    ]);
    saveJobDefinitions.mockResolvedValue([{ ok: true, item: { id: 40 } }]);
  });

  it("persists Full Names setup using fallback job labels without asking for a code", async () => {
    const { savedCount } = await saveOrganizationSetupConfig({
      createdOrg: makeOrganization(),
      shiftDisplayMode: "name",
      departments: [{ id: "dept-1", name: "Operations", abbr: "ops", type: "scheduled" }],
      focusAreas: [{ id: "focus-1", name: "Emergency", departmentId: "dept-1" }],
      certifications: [],
      orgRoles: [],
      shiftCategories: [
        {
          id: "shift-1",
          name: "Day",
          startTime: "07:00",
          endTime: "19:00",
          focusAreaId: "focus-1",
        },
      ],
      jobs: [
        {
          id: "job-1",
          label: "",
          name: "Registered Nurse",
          color: "#123456",
          departmentIds: ["dept-1"],
          focusAreaIds: ["focus-1"],
          shiftCategoryIds: ["shift-1"],
        },
      ],
    });

    expect(savedCount).toBe(4);
    expect(saveDepartments).toHaveBeenCalledWith(
      "org-1",
      [
        expect.objectContaining({
          id: -1,
          name: "Operations",
          abbr: "OPS",
          type: "scheduled",
        }),
      ],
      [],
    );
    expect(saveFocusAreas).toHaveBeenCalledTimes(1);
    expect(saveFocusAreas).toHaveBeenCalledWith(
      "org-1",
      [
        expect.objectContaining({
          orgId: "org-1",
          departmentId: 10,
          name: "Emergency",
        }),
      ],
      [],
    );
    expect(saveShiftCategories).toHaveBeenCalledWith("org-1", [
      expect.objectContaining({
        orgId: "org-1",
        name: "Day",
        abbr: "DAY",
        focusAreaId: 20,
      }),
    ]);
    expect(saveJobDefinitions).toHaveBeenCalledWith("org-1", [
      expect.objectContaining({
        orgId: "org-1",
        name: "Registered Nurse",
        abbr: "REGI",
        assignmentMode: "with_shift",
        eligibilityMode: "and",
        departmentIds: [10],
        focusAreaIds: [20],
        applicableShiftIds: [30],
        color: "",
        border: "",
        text: "",
        shiftTimeOverrides: {},
        shiftColorOverrides: {},
      }),
    ]);
    expect(saveOrganizationSettingsWithRecovery).toHaveBeenCalledWith(
      expect.objectContaining({
        baseline: expect.objectContaining({ id: "org-1" }),
        input: expect.objectContaining({ shiftDisplayMode: "name" }),
      }),
    );
    expect(updateOrganizationSettings).not.toHaveBeenCalled();
  });

  it("rejects incomplete setup placement instead of inferring defaults", async () => {
    await expect(
      saveOrganizationSetupConfig({
        createdOrg: makeOrganization(),
        shiftDisplayMode: "code",
        departments: [{ id: "dept-1", name: "Operations", abbr: "ops", type: "scheduled" }],
        focusAreas: [{ id: "focus-1", name: "Emergency", departmentId: null }],
        certifications: [],
        orgRoles: [],
        shiftCategories: [
          {
            id: "shift-1",
            name: "Day",
            startTime: "07:00",
            endTime: "19:00",
            focusAreaId: null,
          },
        ],
        jobs: [
          {
            id: "job-1",
            label: "rn",
            name: "Registered Nurse",
            color: "#123456",
            departmentIds: [],
            focusAreaIds: [],
            shiftCategoryIds: [],
          },
        ],
      }),
    ).rejects.toThrow("Assign each focus area to a scheduled department");

    expect(saveDepartments).not.toHaveBeenCalled();
    expect(saveFocusAreas).not.toHaveBeenCalled();
    expect(saveShiftCategories).not.toHaveBeenCalled();
    expect(saveJobDefinitions).not.toHaveBeenCalled();
  });

  it("stops with one count when some shifts didn't save, before saving jobs", async () => {
    saveShiftCategories.mockResolvedValue([
      { ok: true, item: { id: 30 } },
      { ok: false, error: "Another shift already uses that name." },
    ]);

    await expect(
      saveOrganizationSetupConfig({
        createdOrg: makeOrganization(),
        shiftDisplayMode: "code",
        departments: [{ id: "dept-1", name: "Operations", abbr: "ops", type: "scheduled" }],
        focusAreas: [{ id: "focus-1", name: "Emergency", departmentId: "dept-1" }],
        certifications: [],
        orgRoles: [],
        shiftCategories: [
          {
            id: "shift-1",
            name: "Day",
            startTime: "07:00",
            endTime: "19:00",
            focusAreaId: "focus-1",
          },
          {
            id: "shift-2",
            name: "Day",
            startTime: "19:00",
            endTime: "07:00",
            focusAreaId: "focus-1",
          },
        ],
        jobs: [
          {
            id: "job-1",
            label: "rn",
            name: "Registered Nurse",
            color: "#123456",
            departmentIds: ["dept-1"],
            focusAreaIds: ["focus-1"],
            shiftCategoryIds: ["shift-1"],
          },
        ],
      }),
    ).rejects.toThrow("We couldn't save 1 of 2 shifts. Try again.");

    expect(saveShiftCategories).toHaveBeenCalledTimes(1);
    expect(saveJobDefinitions).not.toHaveBeenCalled();
  });
});
