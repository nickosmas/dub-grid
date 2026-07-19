import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ShiftPicker from "@/components/ShiftPicker";
import {
  buildAssignableShiftOptions,
  buildScheduleAssignmentOptions,
  formatShiftAssignmentDisqualificationMessage,
  getQualificationSeniorityRank,
  getAssignmentDefinitionDisqualificationReasons,
  isEmployeeQualifiedForJob,
  isEmployeeQualifiedForAssignmentDefinition,
} from "@/lib/assignable-shifts";
import { DEFAULT_SHIFT_JOB_SYSTEM_KEY } from "@/lib/system-jobs";
import type {
  AbsenceType,
  FocusArea,
  JobDefinition,
  NamedItem,
  ShiftCategory,
  AssignmentDefinition,
} from "@/types";

const focusAreas: FocusArea[] = [
  {
    id: 1,
    orgId: "org-1",
    departmentId: null,
    name: "North",
    sortOrder: 0,
  },
];

const shiftCategories: ShiftCategory[] = [
  {
    id: 10,
    orgId: "org-1",
    name: "Day Shift",
    abbr: "D",
    startTime: "07:00",
    endTime: "15:00",
    sortOrder: 0,
    focusAreaId: 1,
  },
];

const jobs: JobDefinition[] = [
  {
    id: 100,
    orgId: "org-1",
    name: "Staff",
    abbr: "ST",
    showOnGrid: true,
    eligibleRoleIds: [],
    requiredCertificationIds: [],
    color: "#DBEAFE",
    border: "#93C5FD",
    text: "#1E40AF",
    sortOrder: 0,
    systemKey: null,
  },
  {
    id: 101,
    orgId: "org-1",
    name: "Supervisor",
    abbr: "S",
    showOnGrid: true,
    eligibleRoleIds: [7],
    requiredCertificationIds: [2],
    color: "#FEF3C7",
    border: "#FCD34D",
    text: "#92400E",
    sortOrder: 1,
  },
  {
    id: 102,
    orgId: "org-1",
    name: "Office",
    abbr: "OFC",
    showOnGrid: true,
    eligibleRoleIds: [],
    requiredCertificationIds: [],
    color: "#E2E8F0",
    border: "#CBD5E1",
    text: "#334155",
    sortOrder: 2,
  },
];

const orgRoles: NamedItem[] = [
  {
    id: 7,
    orgId: "org-1",
    name: "Supervisor",
    abbr: "SUP",
    isScheduleRole: true,
    sortOrder: 0,
    departmentId: null,
  },
  {
    id: 9,
    orgId: "org-1",
    name: "Mentor",
    abbr: "MEN",
    isScheduleRole: true,
    sortOrder: 2,
    departmentId: null,
  },
  {
    id: 8,
    orgId: "org-1",
    name: "Director",
    abbr: "DIR",
    isScheduleRole: false,
    sortOrder: 1,
    departmentId: null,
  },
];

const certifications: NamedItem[] = [
  {
    id: 1,
    orgId: "org-1",
    name: "CSN III",
    abbr: "CSN3",
    sortOrder: 0,
    departmentId: null,
  },
  {
    id: 2,
    orgId: "org-1",
    name: "CSN II",
    abbr: "CSN2",
    sortOrder: 1,
    departmentId: null,
  },
];

const assignments: AssignmentDefinition[] = [
  {
    id: 1,
    orgId: "org-1",
    label: "DST",
    name: "Day Staff",
    color: "#DBEAFE",
    border: "#93C5FD",
    text: "#1E40AF",
    categoryId: 10,
    shiftId: 10,
    jobId: 100,
    focusAreaId: 1,
    sortOrder: 0,
  },
  {
    id: 2,
    orgId: "org-1",
    label: "DS",
    name: "Day Supervisor",
    color: "#DBEAFE",
    border: "#93C5FD",
    text: "#1E40AF",
    categoryId: 10,
    shiftId: 10,
    jobId: 101,
    focusAreaId: 1,
    sortOrder: 1,
  },
  {
    id: 3,
    orgId: "org-1",
    label: "OFC",
    name: "Office",
    color: "#E2E8F0",
    border: "#CBD5E1",
    text: "#334155",
    jobId: 102,
    isGeneral: true,
    sortOrder: 2,
  },
];

describe("assignable shift resolution", () => {
  it("treats selected roles and certifications as any-of gates before applying the matching rule", () => {
    const multiGateJob: JobDefinition = {
      ...jobs[1]!,
      eligibleRoleIds: [7, 9],
      requiredCertificationIds: [1, 2],
      eligibilityMode: "and",
    };

    expect(
      isEmployeeQualifiedForJob(
        {
          certificationId: 1,
          focusAreaIds: [1],
          roleIds: [9],
        },
        multiGateJob,
        [],
        orgRoles,
      ),
    ).toBe(true);

    expect(
      isEmployeeQualifiedForJob(
        {
          certificationId: 1,
          focusAreaIds: [1],
          roleIds: [],
        },
        multiGateJob,
        [],
        orgRoles,
      ),
    ).toBe(false);

    expect(
      isEmployeeQualifiedForJob(
        {
          certificationId: 1,
          focusAreaIds: [1],
          roleIds: [],
        },
        { ...multiGateJob, eligibilityMode: "or" },
        [],
        orgRoles,
      ),
    ).toBe(true);
  });

  it("derives qualification seniority from roles first, then certifications", () => {
    expect(
      getQualificationSeniorityRank({
        job: jobs[1]!,
        orgRoles,
        certifications,
      }),
    ).toBe(1);

    expect(
      getQualificationSeniorityRank({
        job: {
          ...jobs[1]!,
          eligibleRoleIds: [],
          requiredCertificationIds: [2],
        },
        orgRoles,
        certifications,
      }),
    ).toBe(9_999_900_001);

    expect(
      getQualificationSeniorityRank({
        job: {
          ...jobs[1]!,
          eligibleRoleIds: [9],
          requiredCertificationIds: [],
        },
        orgRoles,
        certifications,
      }),
    ).toBe(299_999);
    expect(
      getQualificationSeniorityRank({
        job: {
          ...jobs[1]!,
          eligibleRoleIds: [8],
          requiredCertificationIds: [],
        },
        orgRoles,
        certifications,
      }),
    ).toBeNull();

    expect(
      getQualificationSeniorityRank({
        job: {
          ...jobs[1]!,
          eligibleRoleIds: [9],
          requiredCertificationIds: [1],
        },
        orgRoles,
        certifications,
      }),
    ).toBeGreaterThan(
      getQualificationSeniorityRank({
        job: {
          ...jobs[1]!,
          eligibleRoleIds: [7],
          requiredCertificationIds: [2],
        },
        orgRoles,
        certifications,
      }) ?? Number.MAX_SAFE_INTEGER,
    );
  });

  it("falls back to legacy shift-code certifications and ignores archived rank sources", () => {
    expect(
      getQualificationSeniorityRank({
        job: {
          ...jobs[0]!,
          eligibleRoleIds: [],
          requiredCertificationIds: [],
        },
        fallbackRequiredCertificationIds: [1],
        orgRoles,
        certifications,
      }),
    ).toBe(9_999_900_000);

    expect(
      getQualificationSeniorityRank({
        job: {
          ...jobs[1]!,
          eligibleRoleIds: [7],
          requiredCertificationIds: [2],
        },
        orgRoles: orgRoles.map((role) =>
          role.id === 7 ? { ...role, archivedAt: "2026-04-01T00:00:00Z" } : role,
        ),
        certifications: certifications.map((certification) =>
          certification.id === 2
            ? { ...certification, archivedAt: "2026-04-01T00:00:00Z" }
            : certification,
        ),
      }),
    ).toBeNull();
  });

  it("builds explicit scheduled jobs, specialty jobs, and shiftless options with combined labels", () => {
    const options = buildAssignableShiftOptions({
      assignments,
      shiftCategories,
      jobs,
      focusAreas,
      certifications,
      shiftDisplayMode: "code",
    });

    const plain = options.find((option) => option.assignmentId === 1);
    const supervisor = options.find((option) => option.assignmentId === 2);
    const office = options.find((option) => option.assignmentId === 3);

    expect(plain).toMatchObject({
      primaryLabel: "D",
      secondaryLabel: "ST",
      showJobOnGrid: true,
      isShiftless: false,
    });
    expect(supervisor).toMatchObject({
      primaryLabel: "D",
      secondaryLabel: "S",
      showJobOnGrid: true,
      isShiftless: false,
    });
    expect(office).toMatchObject({
      primaryLabel: "OFC",
      secondaryLabel: null,
      isShiftless: true,
      groupLabel: "General",
    });
  });

  it("generates shift-only assignments from the configurable default shift job", () => {
    const defaultShiftJob: JobDefinition = {
      ...jobs[0]!,
      id: 104,
      name: "Default shift job",
      abbr: "SHIFT",
      showOnGrid: false,
      eligibleRoleIds: [7],
      shiftColorOverrides: { "10": "#D9F99D" },
      systemKey: DEFAULT_SHIFT_JOB_SYSTEM_KEY,
    };
    const generatedAssignments = buildScheduleAssignmentOptions({
      orgId: "org-1",
      focusAreas,
      shiftCategories,
      jobs: [defaultShiftJob],
    });

    expect(generatedAssignments).toHaveLength(1);
    expect(generatedAssignments[0]).toMatchObject({
      label: "D",
      name: "Day Shift",
      shiftId: 10,
      jobId: 104,
      color: "#D9F99D",
    });

    const ineligibleOptions = buildAssignableShiftOptions({
      assignments: generatedAssignments,
      shiftCategories,
      jobs: [defaultShiftJob],
      focusAreas,
      orgRoles,
      employee: {
        certificationId: null,
        focusAreaIds: [1],
        roleIds: [],
      },
      shiftDisplayMode: "name",
    });
    expect(ineligibleOptions).toEqual([]);

    const eligibleOptions = buildAssignableShiftOptions({
      assignments: generatedAssignments,
      shiftCategories,
      jobs: [defaultShiftJob],
      focusAreas,
      orgRoles,
      employee: {
        certificationId: null,
        focusAreaIds: [1],
        roleIds: [7],
      },
      shiftDisplayMode: "name",
    });

    expect(eligibleOptions[0]).toMatchObject({
      primaryLabel: "Day Shift",
      secondaryLabel: null,
      showJobOnGrid: false,
      isShiftOnly: true,
      isShiftless: false,
    });

    render(
      <ShiftPicker
        assignments={generatedAssignments}
        shiftCategories={shiftCategories}
        jobs={[defaultShiftJob]}
        orgRoles={orgRoles}
        focusAreas={focusAreas}
        onSelect={vi.fn()}
        empFocusAreaIds={[1]}
        empRoleIds={[7]}
      />,
    );

    expect(screen.getByRole("button", { name: "Day Shift" })).toBeInTheDocument();
    expect(screen.queryByText("Default shift job")).not.toBeInTheDocument();
  });

  it("excludes shift-only default-shift-job options when defaultShiftEnabled is false", () => {
    const defaultShiftJob: JobDefinition = {
      ...jobs[0]!,
      id: 104,
      name: "Default shift job",
      abbr: "SHIFT",
      showOnGrid: false,
      eligibleRoleIds: [],
      systemKey: DEFAULT_SHIFT_JOB_SYSTEM_KEY,
    };
    const generatedAssignments = buildScheduleAssignmentOptions({
      orgId: "org-1",
      focusAreas,
      shiftCategories,
      jobs: [defaultShiftJob],
    });

    const optionsWhenEnabled = buildAssignableShiftOptions({
      assignments: generatedAssignments,
      shiftCategories,
      jobs: [defaultShiftJob],
      focusAreas,
      orgRoles,
      employee: {
        certificationId: null,
        focusAreaIds: [1],
        roleIds: [],
      },
      shiftDisplayMode: "name",
      defaultShiftEnabled: true,
    });
    expect(optionsWhenEnabled).toHaveLength(1);

    const optionsWhenDisabled = buildAssignableShiftOptions({
      assignments: generatedAssignments,
      shiftCategories,
      jobs: [defaultShiftJob],
      focusAreas,
      orgRoles,
      employee: {
        certificationId: null,
        focusAreaIds: [1],
        roleIds: [],
      },
      shiftDisplayMode: "name",
      defaultShiftEnabled: false,
    });
    expect(optionsWhenDisabled).toEqual([]);

    render(
      <ShiftPicker
        assignments={generatedAssignments}
        shiftCategories={shiftCategories}
        jobs={[defaultShiftJob]}
        orgRoles={orgRoles}
        focusAreas={focusAreas}
        onSelect={vi.fn()}
        empFocusAreaIds={[1]}
        empRoleIds={[]}
        defaultShiftEnabled={false}
      />,
    );

    expect(screen.queryByRole("button", { name: "Day Shift" })).not.toBeInTheDocument();
  });

  it("filters specialty jobs by combined role and certification eligibility", () => {
    const options = buildAssignableShiftOptions({
      assignments,
      shiftCategories,
      jobs,
      focusAreas,
      certifications,
      employee: {
        certificationId: null,
        focusAreaIds: [1],
        roleIds: [],
      },
      shiftDisplayMode: "name",
    });

    expect(options.map((option) => option.assignmentId).sort()).toEqual([1, 3]);
  });

  it("ignores stale legacy assignments that are not backed by current jobs", () => {
    const staleLegacyCodes: AssignmentDefinition[] = [
      ...assignments,
      {
        id: 4,
        orgId: "org-1",
        label: "LEG",
        name: "Legacy General",
        color: "#E2E8F0",
        border: "#CBD5E1",
        text: "#334155",
        isGeneral: true,
        sortOrder: 3,
      },
      {
        id: 5,
        orgId: "org-1",
        label: "DX",
        name: "Day Legacy",
        color: "#DBEAFE",
        border: "#93C5FD",
        text: "#1E40AF",
        categoryId: 10,
        shiftId: 10,
        jobId: 999,
        focusAreaId: 1,
        sortOrder: 4,
      },
    ];

    const options = buildAssignableShiftOptions({
      assignments: staleLegacyCodes,
      shiftCategories,
      jobs,
      focusAreas,
      certifications,
      shiftDisplayMode: "name",
    });

    expect(options.map((option) => option.assignmentId).sort()).toEqual([1, 2, 3]);
  });

  it("qualifies a mapped shift code against its resolved shift and job", () => {
    expect(
      isEmployeeQualifiedForAssignmentDefinition(
        {
          certificationId: 2,
          focusAreaIds: [1],
          roleIds: [7],
        },
        {
          assignment: assignments[1]!,
          shiftCategories,
          jobs,
        },
      ),
    ).toBe(true);

    expect(
      getAssignmentDefinitionDisqualificationReasons(
        {
          certificationId: null,
          focusAreaIds: [],
          roleIds: [],
        },
        {
          assignment: assignments[1]!,
          shiftCategories,
          jobs,
          focusAreaNames: new Map([[1, "North"]]),
          roleNames: new Map([[7, "Supervisor"]]),
          certificationNames: new Map([[2, "CSN II"]]),
        },
      ),
    ).toEqual(["the North focus area", "the Supervisor role", "CSN II certification"]);
  });

  it("ignores cosmetic roles when evaluating job eligibility", () => {
    const directorOnlyJob: JobDefinition = {
      ...jobs[1]!,
      id: 103,
      name: "Director Coverage",
      abbr: "DIR",
      eligibleRoleIds: [8],
      requiredCertificationIds: [],
    };
    const directorOnlyAssignmentDefinition: AssignmentDefinition = {
      ...assignments[1]!,
      id: 4,
      label: "DDIR",
      name: "Day Director",
      jobId: 103,
    };

    expect(
      isEmployeeQualifiedForAssignmentDefinition(
        {
          certificationId: null,
          focusAreaIds: [1],
          roleIds: [],
        },
        {
          assignment: directorOnlyAssignmentDefinition,
          shiftCategories,
          jobs: [...jobs, directorOnlyJob],
          orgRoles,
        },
      ),
    ).toBe(true);
  });

  it("formats assignment qualification messages as natural sentences", () => {
    expect(
      formatShiftAssignmentDisqualificationMessage({
        employeeName: "Nancy Thornton",
        assignmentLabel: "E · SUPV",
        reasons: ["the Emergency focus area", "the Supervisor role"],
      }),
    ).toBe(
      "Nancy Thornton can't take E · SUPV because this assignment requires the Emergency focus area and the Supervisor role.",
    );

    expect(
      formatShiftAssignmentDisqualificationMessage({
        employeeName: "Nancy Thornton",
        assignmentLabel: "E · SUPV",
        reasons: ["the Supervisor role or RN certification"],
      }),
    ).toBe(
      "Nancy Thornton can't take E · SUPV because this assignment requires the Supervisor role or RN certification.",
    );
  });
});

describe("ShiftPicker combined options", () => {
  it("spells out shift and job names even when the organization uses code display mode", () => {
    render(
      <ShiftPicker
        assignments={assignments}
        shiftCategories={shiftCategories}
        jobs={jobs}
        certifications={certifications}
        focusAreas={focusAreas}
        onSelect={vi.fn()}
        empFocusAreaIds={[1]}
        empCertificationId={null}
        empRoleIds={[]}
      />,
    );

    const dayStaff = screen.getByRole("button", {
      name: "Day Shift - Staff",
    });
    expect(within(dayStaff).getByText("Day Shift")).toBeInTheDocument();
    expect(within(dayStaff).getByText("Staff")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "D - ST" })).not.toBeInTheDocument();
  });

  it("shows only eligible combined options and keeps shiftless jobs under General", () => {
    render(
      <ShiftPicker
        assignments={assignments}
        shiftCategories={shiftCategories}
        jobs={jobs}
        certifications={certifications}
        focusAreas={focusAreas}
        onSelect={vi.fn()}
        empFocusAreaIds={[1]}
        empCertificationId={null}
        empRoleIds={[]}
      />,
    );

    expect(screen.getByRole("button", { name: "Day Shift - Staff" })).toBeInTheDocument();
    expect(screen.queryByText("Supervisor")).not.toBeInTheDocument();
    expect(screen.getByText("General")).toBeInTheDocument();
    expect(screen.getByText("Office")).toBeInTheDocument();
  });

  it("keeps absence types while hiding stale non-job legacy assignments", () => {
    const absenceTypes: AbsenceType[] = [
      {
        id: 11,
        orgId: "org-1",
        label: "VAC",
        name: "Vacation",
        color: "#E2E8F0",
        border: "#CBD5E1",
        text: "#334155",
        sortOrder: 0,
      },
    ];

    render(
      <ShiftPicker
        assignments={[
          ...assignments,
          {
            id: 4,
            orgId: "org-1",
            label: "LEG",
            name: "Legacy General",
            color: "#E2E8F0",
            border: "#CBD5E1",
            text: "#334155",
            isGeneral: true,
            sortOrder: 3,
          },
        ]}
        shiftCategories={shiftCategories}
        jobs={jobs}
        certifications={certifications}
        focusAreas={focusAreas}
        absenceTypes={absenceTypes}
        onSelect={vi.fn()}
        onAbsenceSelect={vi.fn()}
        empFocusAreaIds={[1]}
        empCertificationId={null}
        empRoleIds={[]}
      />,
    );

    expect(screen.queryByText("Legacy General")).not.toBeInTheDocument();
    expect(screen.getByText("Off Days")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "VAC - Vacation" })).toBeInTheDocument();
  });

  it("sorts pills by qualification seniority within each group without reordering the group", () => {
    const mentorJob: JobDefinition = {
      ...jobs[1]!,
      id: 103,
      name: "Mentor",
      abbr: "M",
      eligibleRoleIds: [9],
      requiredCertificationIds: [],
      sortOrder: 0,
    };
    const mentorAssignmentDefinition: AssignmentDefinition = {
      ...assignments[1]!,
      id: 4,
      label: "DM",
      name: "Day Mentor",
      jobId: 103,
      sortOrder: 0,
    };

    render(
      <ShiftPicker
        assignments={[assignments[0]!, assignments[1]!, mentorAssignmentDefinition]}
        shiftCategories={shiftCategories}
        jobs={[jobs[0]!, jobs[1]!, mentorJob]}
        orgRoles={orgRoles}
        certifications={certifications}
        focusAreas={focusAreas}
        onSelect={vi.fn()}
        empFocusAreaIds={[1]}
        empCertificationId={2}
        empRoleIds={[7, 9]}
      />,
    );

    const group = screen.getByRole("group", {
      name: "Day Shift shift options",
    });
    expect(
      within(group)
        .getAllByRole("button")
        .map((button) => button.getAttribute("aria-label")),
    ).toEqual(["Day Shift - Supervisor", "Day Shift - Mentor", "Day Shift - Staff"]);
  });
});
