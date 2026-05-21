import { screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithQuery as render } from "@/test-utils/renderWithQuery";
import { RecurringScheduleSection } from "@/components/staff/RecurringScheduleSection";
import type {
  Employee,
  JobDefinition,
  RecurringShift,
  ShiftCategory,
  AssignmentDefinition,
} from "@/types";

const { fetchRecurringShifts } = vi.hoisted(() => ({
  fetchRecurringShifts: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@/features/schedule/client", () => ({
  deleteRecurringDraft: vi.fn(),
  deleteRecurringShift: vi.fn(),
  fetchRecurringShifts,
  getRecurringDraft: vi.fn().mockResolvedValue(null),
  saveRecurringDraft: vi.fn(),
  upsertRecurringShift: vi.fn(),
}));

const employees: Employee[] = [
  {
    id: "emp-1",
    firstName: "Alice",
    lastName: "Smith",
    employmentType: "full_time",
    status: "active",
    statusChangedAt: null,
    statusNote: "",
    certificationId: null,
    roleIds: [],
    seniority: 1,
    focusAreaIds: [1],
    phone: "",
    email: "",
    contactNotes: "",
    userId: null,
    departmentIds: [],
    deptAdminIds: [],
    version: 0,
  },
];

const shiftCategories: ShiftCategory[] = [
  {
    id: 1,
    orgId: "org-1",
    name: "Day",
    abbr: "D",
    sortOrder: 1,
  },
];

const assignments: AssignmentDefinition[] = [
  {
    id: 1,
    orgId: "org-1",
    label: "DSSTA",
    name: "Day Staff",
    color: "#E5F3E8",
    border: "#2E9930",
    text: "#1A3D1B",
    categoryId: 1,
    jobId: 101,
    sortOrder: 1,
  },
];

const jobs: JobDefinition[] = [
  {
    id: 101,
    orgId: "org-1",
    name: "Staff",
    abbr: "STA",
    showOnGrid: true,
    assignmentMode: "with_shift",
    eligibilityMode: "and",
    focusAreaId: null,
    focusAreaIds: [],
    departmentIds: [],
    applicableShiftIds: [],
    eligibleRoleIds: [],
    requiredCertificationIds: [],
    color: "#E5F3E8",
    border: "#2E9930",
    text: "#1A3D1B",
    shiftTimeOverrides: {},
    shiftColorOverrides: {},
    defaultStartTime: null,
    defaultEndTime: null,
    defaultDurationHours: null,
    defaultDurationMinutes: null,
    sortOrder: 1,
    systemKey: null,
    archivedAt: null,
  },
];

const recurringShifts: RecurringShift[] = [
  {
    id: "rec-1",
    empId: "emp-1",
    orgId: "org-1",
    dayOfWeek: 0,
    state: {
      kind: "worked",
      segments: [
        {
          shiftId: 1,
          jobId: 101,
          position: 0,
        },
      ],
      absenceTypeId: null,
      customStartTime: null,
      customEndTime: null,
      seriesId: null,
      fromRecurring: true,
    },
    input: {
      kind: "worked",
      segments: [
        {
          shiftId: 1,
          jobId: 101,
          position: 0,
        },
      ],
      absenceTypeId: null,
      customStartTime: null,
      customEndTime: null,
      seriesId: null,
      fromRecurring: true,
    },
    absenceTypeId: null,
    shiftLabel: "D / STA",
    effectiveFrom: "2026-01-01",
    effectiveUntil: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    archivedAt: null,
  },
];

function renderSection(shiftDisplayMode: "code" | "name") {
  return render(
    <RecurringScheduleSection
      employees={employees}
      orgId="org-1"
      currentUserId={null}
      assignments={assignments}
      shiftCategories={shiftCategories}
      jobs={jobs}
      orgRoles={[]}
      assignmentMap={new Map([[1, "DSSTA"]])}
      canManage={false}
      focusAreas={[]}
      certifications={[]}
      absenceTypes={[]}
      shiftDisplayMode={shiftDisplayMode}
    />,
  );
}

describe("RecurringScheduleSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchRecurringShifts.mockResolvedValue(recurringShifts);
  });

  it("renders recurring shifts with split code labels like the main grid", async () => {
    renderSection("code");

    const sundayCell = await screen.findByLabelText("Alice Smith, Sun: D / STA");
    expect(within(sundayCell).getByText("D")).toBeInTheDocument();
    expect(within(sundayCell).getByText("STA")).toBeInTheDocument();
    expect(within(sundayCell).queryByText(/^SSTA$/)).not.toBeInTheDocument();
    expect(within(sundayCell).queryByText(/^DS$/)).not.toBeInTheDocument();
  });

  it("renders recurring shifts with split name labels like the main grid", async () => {
    renderSection("name");

    const sundayCell = await screen.findByLabelText(
      "Alice Smith, Sun: Day / Staff",
    );
    expect(within(sundayCell).getByText("Day")).toBeInTheDocument();
    expect(within(sundayCell).getByText("Staff")).toBeInTheDocument();
    expect(
      within(sundayCell).queryByText(/^Day Staff$/),
    ).not.toBeInTheDocument();
  });
});
