import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import PrintScheduleView from "@/components/PrintScheduleView";
import type {
  AbsenceType,
  AssignmentDefinition,
  Employee,
  FocusArea,
  ShiftCategory,
} from "@/types";

vi.mock("@/components/AuthProvider", () => ({
  useAuth: () => ({ user: null, signOut: vi.fn(), isLoading: false }),
}));

const focusAreas: FocusArea[] = [
  { id: 1, orgId: "org-1", departmentId: 1, name: "North", sortOrder: 1 },
];

const shiftCategories: ShiftCategory[] = [{ id: 1, orgId: "org-1", name: "Day", sortOrder: 1 }];

const assignments: AssignmentDefinition[] = [
  {
    id: 1,
    orgId: "org-1",
    label: "D",
    name: "Day Shift",
    color: "#E5F3E8",
    border: "#2E9930",
    text: "#1A3D1B",
    categoryId: 1,
    focusAreaId: 1,
    sortOrder: 1,
  },
];

const vacation: AbsenceType = {
  id: 7,
  orgId: "org-1",
  label: "VAC/Flex",
  name: "Vacation or Flex",
  color: "#FDE68A",
  border: "#D97706",
  text: "#92400E",
  sortOrder: 1,
};

const employees: Employee[] = [
  {
    id: "emp-1",
    firstName: "Alex",
    lastName: "Taylor",
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
    deptAdminIds: [],
    userId: null,
    departmentIds: [],
    version: 0,
  },
];

function renderPrintView() {
  return render(
    <PrintScheduleView
      orgName="Test Org"
      weekStart={new Date(2024, 0, 7)}
      config={{ fontSize: 12, selectedFocusAreas: ["North"], spanWeeks: 1 }}
      employees={employees}
      allEmployees={employees}
      focusAreas={focusAreas}
      assignments={assignments}
      shiftCategories={shiftCategories}
      jobs={[]}
      certifications={[]}
      orgRoles={[]}
      shiftForKey={() => vacation.label}
      assignmentIdsForKey={() => []}
      absenceTypeIdForKey={() => vacation.id}
      absenceTypeMap={new Map([[vacation.id, vacation]])}
      getShiftStyle={() => assignments[0]}
      onClose={() => {}}
    />,
  );
}

describe("PrintScheduleView", () => {
  it("prints an absence in its own colors on one pill", () => {
    renderPrintView();

    // One cell per printed day, each holding a single absence pill.
    const pills = screen.getAllByText(vacation.label);

    expect(pills.length).toBe(7);
    for (const pill of pills) {
      const surface = pill.closest("div[style*='border-radius']") as HTMLElement | null;
      expect(surface?.style.background).toBe("rgb(253, 230, 138)");
    }
  });
});
