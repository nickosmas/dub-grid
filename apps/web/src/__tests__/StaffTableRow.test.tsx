import type { ReactNode } from "react";
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { StaffReorderListRow, StaffTableRow } from "@/components/staff/StaffTableRow";
import type { Employee } from "@/types";

vi.mock("@/components/AuthProvider", () => ({
  useAuth: () => ({ user: null }),
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: ReactNode;
    [key: string]: unknown;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

function makeEmployee(overrides: Partial<Employee>): Employee {
  return {
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
    focusAreaIds: [],
    phone: "",
    email: "",
    contactNotes: "",
    userId: null,
    departmentIds: [],
    deptAdminIds: [],
    version: 0,
    ...overrides,
  };
}

describe("StaffReorderListRow", () => {
  it("shows position-based numbers for a pending reordered list", () => {
    const first = makeEmployee({
      id: "emp-1",
      firstName: "Alice",
      lastName: "Smith",
      seniority: 2,
    });
    const second = makeEmployee({
      id: "emp-2",
      firstName: "Bob",
      lastName: "Jones",
      seniority: 1,
    });

    const commonProps = {
      isExpanded: false,
      isReordering: true,
      isDragging: false,
      canManageEmployees: true,
      canViewEmployeeDetails: true,
      canNavigateToDetailsPage: true,
      isSelected: false,
      focusAreas: [],
      certifications: [],
      roles: [],
      pendingInviteByEmployeeId: new Map(),
      onToggleSelect: vi.fn(),
      onRowClick: vi.fn(),
    };

    const { container } = render(
      <>
        <StaffReorderListRow
          {...commonProps}
          emp={first}
          globalIndex={0}
        />
        <StaffReorderListRow
          {...commonProps}
          emp={second}
          globalIndex={1}
        />
      </>,
    );

    const ranks = Array.from(
      container.querySelectorAll(".dg-staff-directory-cell--rank span"),
    ).map((node) => node.textContent);

    expect(ranks).toEqual(["1", "2"]);
  });

  it("applies row movement as a direct transform so CSS can animate it", () => {
    const employee = makeEmployee({
      id: "emp-1",
      firstName: "Alice",
      lastName: "Smith",
      seniority: 1,
    });

    const { container } = render(
      <StaffReorderListRow
        emp={employee}
        globalIndex={0}
        isExpanded={false}
        isReordering
        isDragging={false}
        canManageEmployees
        canViewEmployeeDetails
        canNavigateToDetailsPage
        isSelected={false}
        focusAreas={[]}
        certifications={[]}
        roles={[]}
        pendingInviteByEmployeeId={new Map()}
        onToggleSelect={vi.fn()}
        onRowClick={vi.fn()}
        dragOffsetY={56}
      />,
    );

    const row = container.querySelector(".dg-staff-directory-row") as HTMLElement;

    expect(row.style.transform).toBe("translate3d(0, 56px, 0)");
  });
});

describe("StaffTableRow column gating", () => {
  function renderRow(canViewEmployeeDetails: boolean) {
    return render(
      <table>
        <tbody>
          <StaffTableRow
            emp={makeEmployee({
              id: "emp-1",
              firstName: "Alice",
              lastName: "Smith",
              status: "active",
              email: "alice@example.com",
              employmentType: "full_time",
            })}
            globalIndex={0}
            isExpanded={false}
            isReordering={false}
            isDragging={false}
            canManageEmployees={false}
            canViewEmployeeDetails={canViewEmployeeDetails}
            canNavigateToDetailsPage={false}
            isSelected={false}
            focusAreas={[]}
            certifications={[]}
            roles={[]}
            pendingInviteByEmployeeId={new Map()}
            onToggleSelect={vi.fn()}
            onRowClick={vi.fn()}
          />
        </tbody>
      </table>,
    );
  }

  it("hides HR/admin columns when canViewEmployeeDetails is false", () => {
    const { container, queryByText } = renderRow(false);

    expect(container.querySelector(".dg-staff-directory-cell--rank")).toBeNull();
    expect(queryByText("Full-time")).toBeNull();
    expect(queryByText("Active")).toBeNull();
    expect(queryByText("Not invited")).toBeNull();
  });

  it("shows HR/admin columns when canViewEmployeeDetails is true", () => {
    const { queryByText } = renderRow(true);

    expect(queryByText("Full-time")).not.toBeNull();
    expect(queryByText("Active")).not.toBeNull();
    expect(queryByText("Not invited")).not.toBeNull();
  });
});
