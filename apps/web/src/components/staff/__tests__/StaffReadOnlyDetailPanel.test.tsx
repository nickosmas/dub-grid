import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StaffReadOnlyDetailPanel } from "@/components/staff/StaffReadOnlyDetailPanel";
import type { Employee } from "@/types";

vi.mock("next-themes", () => ({
  useTheme: () => ({ resolvedTheme: "light" }),
}));

vi.mock("@/hooks/useSlideoverClose", () => ({
  useSlideoverClose: () => ({ requestClose: vi.fn(), isClosing: false }),
}));

const coworker: Employee = {
  id: "emp-1",
  firstName: "Pat",
  lastName: "Doe",
  employmentType: "part_time",
  status: "active",
  statusChangedAt: null,
  statusNote: "",
  certificationId: null,
  roleIds: [],
  seniority: 1,
  focusAreaIds: [1],
  // What the employees API hands a viewer without employee details.
  phone: "",
  email: "",
  contactNotes: "",
  userId: null,
  departmentIds: [],
  deptAdminIds: [],
  version: 1,
};

function renderPanel(props: Partial<React.ComponentProps<typeof StaffReadOnlyDetailPanel>> = {}) {
  return render(
    <StaffReadOnlyDetailPanel
      employee={coworker}
      focusAreas={[{ id: 1, name: "East Wing", departmentId: 4 } as never]}
      certifications={[]}
      roles={[]}
      roleLabel="Roles"
      focusAreaLabel="Wings"
      certificationLabel="Certifications"
      onClose={vi.fn()}
      {...props}
    />,
  );
}

afterEach(() => {
  cleanup();
});

describe("StaffReadOnlyDetailPanel", () => {
  // A regular user's roster already hides the Employment column and the API
  // blanks a coworker's contact details; the panel used to print both anyway,
  // "Part-time" as a pill and a Contact section of two dashes.
  it("shows a regular user directory facts only", () => {
    renderPanel();

    expect(screen.getAllByText("Pat Doe").length).toBeGreaterThan(0);
    expect(screen.getByText("East Wing")).toBeInTheDocument();
    expect(screen.queryByText("Part-time")).not.toBeInTheDocument();
    expect(screen.queryByText("Employment")).not.toBeInTheDocument();
    expect(screen.queryByText("Contact")).not.toBeInTheDocument();
  });

  it("keeps employment and contact for a viewer with employee details", () => {
    renderPanel({
      canViewEmployeeDetails: true,
      employee: { ...coworker, email: "pat@example.com" },
    });

    expect(screen.getAllByText("Part-time").length).toBeGreaterThan(0);
    expect(screen.getByText("Contact")).toBeInTheDocument();
    expect(screen.getByText("pat@example.com")).toBeInTheDocument();
  });
});
