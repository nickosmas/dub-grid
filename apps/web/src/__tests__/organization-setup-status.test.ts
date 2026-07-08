import { describe, expect, it } from "vitest";
import { computeOrganizationSetupStatus } from "@/hooks/useOrganizationData";
import type { Department, FocusArea, JobDefinition, NamedItem, ShiftCategory } from "@/types";

const departments: Department[] = [
  {
    id: 10,
    orgId: "org-1",
    name: "Operations",
    abbr: "OPS",
    type: "scheduled",
    sortOrder: 0,
  },
];

const focusAreas: FocusArea[] = [
  {
    id: 20,
    orgId: "org-1",
    departmentId: 10,
    name: "Emergency",
    sortOrder: 0,
  },
];

const shiftCategories: ShiftCategory[] = [
  {
    id: 30,
    orgId: "org-1",
    name: "Day",
    abbr: "DAY",
    startTime: "07:00",
    endTime: "19:00",
    focusAreaId: 20,
    sortOrder: 0,
  },
];

const jobs: JobDefinition[] = [
  {
    id: 40,
    orgId: "org-1",
    name: "Registered Nurse",
    abbr: "RN",
    showOnGrid: true,
    assignmentMode: "with_shift",
    eligibilityMode: "and",
    focusAreaIds: [20],
    departmentIds: [10],
    applicableShiftIds: [30],
    eligibleRoleIds: [],
    requiredCertificationIds: [],
    color: "",
    border: "",
    text: "",
    sortOrder: 0,
  },
];

const certifications: NamedItem[] = [
  { id: 50, orgId: "org-1", name: "RN", abbr: "RN", sortOrder: 0 },
];

const orgRoles: NamedItem[] = [{ id: 60, orgId: "org-1", name: "Nurse", abbr: "N", sortOrder: 0 }];

describe("computeOrganizationSetupStatus", () => {
  it("requires current department, focus area, shift, and job placement relationships", () => {
    expect(
      computeOrganizationSetupStatus({
        departments,
        focusAreas,
        shiftCategories,
        jobs,
        certifications,
        orgRoles,
      }).isComplete,
    ).toBe(true);

    expect(
      computeOrganizationSetupStatus({
        departments,
        focusAreas: [{ ...focusAreas[0]!, departmentId: null }],
        shiftCategories,
        jobs,
        certifications,
        orgRoles,
      }),
    ).toMatchObject({
      isComplete: false,
      missing: { focusAreas: true },
    });

    expect(
      computeOrganizationSetupStatus({
        departments,
        focusAreas,
        shiftCategories: [{ ...shiftCategories[0]!, focusAreaId: null }],
        jobs,
        certifications,
        orgRoles,
      }),
    ).toMatchObject({
      isComplete: false,
      missing: { scheduleDefinitions: true },
    });

    expect(
      computeOrganizationSetupStatus({
        departments,
        focusAreas,
        shiftCategories,
        jobs: [{ ...jobs[0]!, departmentIds: [], focusAreaIds: [] }],
        certifications,
        orgRoles,
      }),
    ).toMatchObject({
      isComplete: false,
      missing: { scheduleDefinitions: true },
    });

    expect(
      computeOrganizationSetupStatus({
        departments,
        focusAreas,
        shiftCategories,
        jobs: [{ ...jobs[0]!, applicableShiftIds: [] }],
        certifications,
        orgRoles,
      }),
    ).toMatchObject({
      isComplete: false,
      missing: { scheduleDefinitions: true },
    });

    expect(
      computeOrganizationSetupStatus({
        departments,
        focusAreas,
        shiftCategories,
        jobs: [{ ...jobs[0]!, departmentIds: [], focusAreaIds: [], focusAreaId: 20 }],
        certifications,
        orgRoles,
      }),
    ).toMatchObject({
      isComplete: false,
      missing: { scheduleDefinitions: true },
    });
  });
});
