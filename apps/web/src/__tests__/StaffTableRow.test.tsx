import type { ReactNode } from "react";
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { StaffReorderListRow, StaffTableRow } from "@/components/staff/StaffTableRow";
import type { Employee, Invitation } from "@/types";

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
      showStatusColumn: false,
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
        <StaffReorderListRow {...commonProps} emp={first} globalIndex={0} />
        <StaffReorderListRow {...commonProps} emp={second} globalIndex={1} />
      </>,
    );

    const ranks = Array.from(container.querySelectorAll(".dg-staff-directory-cell--rank span")).map(
      (node) => node.textContent,
    );

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
        showStatusColumn={false}
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
  function renderRow(canViewEmployeeDetails: boolean, showStatusColumn = true) {
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
              employeeNumber: 1001,
            })}
            globalIndex={0}
            isExpanded={false}
            isReordering={false}
            isDragging={false}
            canManageEmployees={false}
            canViewEmployeeDetails={canViewEmployeeDetails}
            showStatusColumn={showStatusColumn}
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
    const { getByText, queryByText } = renderRow(true);

    expect(queryByText("Full-time")).not.toBeNull();
    expect(queryByText("Active")).not.toBeNull();
    expect(queryByText("Not invited")).not.toBeNull();
    expect(getByText("#1001")).toHaveStyle({ color: "var(--dg-color-text-primary)" });
    expect(getByText("alice@example.com").className).toContain(
      "text-[var(--dg-color-text-primary)]",
    );
    expect(getByText("Full-time").className).toContain("text-[var(--dg-color-text-primary)]");
  });

  it("shows status only when the selected tab combines employee statuses", () => {
    const { queryByText } = renderRow(true, false);

    expect(queryByText("Active")).toBeNull();
  });

  it("does not render invitation-dependent account or access states before lookup settles", () => {
    const { queryByLabelText } = render(
      <table>
        <tbody>
          <StaffTableRow
            emp={makeEmployee({ id: "pending", email: "pending@example.com", userId: null })}
            globalIndex={0}
            isExpanded={false}
            isReordering={false}
            isDragging={false}
            canManageEmployees={false}
            canViewEmployeeDetails
            showStatusColumn={false}
            canNavigateToDetailsPage={false}
            isSelected={false}
            focusAreas={[]}
            certifications={[]}
            roles={[]}
            invitationStateReady={false}
            pendingInviteByEmployeeId={new Map()}
            onToggleSelect={vi.fn()}
            onRowClick={vi.fn()}
          />
        </tbody>
      </table>,
    );

    expect(queryByLabelText(/^Account:/)).toBeNull();
  });

  it("uses the category-pill treatment for roster status, focus areas, overflow, and account", () => {
    const { container } = render(
      <table>
        <tbody>
          <StaffTableRow
            emp={makeEmployee({
              id: "emp-1",
              firstName: "Alice",
              lastName: "Smith",
              status: "active",
              email: "alice@example.com",
              focusAreaIds: [1, 2, 3],
            })}
            globalIndex={0}
            isExpanded={false}
            isReordering={false}
            isDragging={false}
            canManageEmployees={false}
            canViewEmployeeDetails
            showStatusColumn
            canNavigateToDetailsPage={false}
            isSelected={false}
            focusAreas={[
              {
                id: 1,
                orgId: "org-1",
                departmentId: 1,
                name: "Skilled Nursing",
                sortOrder: 0,
              },
              {
                id: 2,
                orgId: "org-1",
                departmentId: 1,
                name: "Memory Care",
                sortOrder: 1,
              },
              {
                id: 3,
                orgId: "org-1",
                departmentId: 1,
                name: "Rehabilitation",
                sortOrder: 2,
              },
            ]}
            certifications={[]}
            roles={[]}
            pendingInviteByEmployeeId={new Map()}
            onToggleSelect={vi.fn()}
            onRowClick={vi.fn()}
          />
        </tbody>
      </table>,
    );

    const findPill = (label: string) =>
      Array.from(container.querySelectorAll("span")).find((node) => node.textContent === label);

    // Focus areas stay square category pills with no leading mark.
    for (const label of ["Skilled Nursing", "Memory Care", "+1 more"]) {
      const pill = findPill(label);
      expect(pill?.className).toContain("rounded-[4px]");
      expect(pill?.className).toContain("font-semibold");
      expect(pill?.querySelector('[aria-hidden="true"]')).toBeNull();
    }

    // Status matches the Account pill instead: rounded, borderless, and led by
    // a tone dot rather than an icon.
    const statusPill = findPill("Active");
    expect(statusPill?.className).toContain("rounded-full");
    expect(statusPill?.className).toContain("font-semibold");
    expect(statusPill?.getAttribute("style")).not.toContain("border");
    const statusDot = statusPill?.querySelector('[aria-hidden="true"]');
    expect(statusDot).not.toBeNull();
    expect(statusDot?.className).toContain("rounded-full");

    const accountPill = container.querySelector('[aria-label="Account: Not invited"]');
    expect(accountPill?.className).toContain("rounded-full");
    expect(accountPill?.className).toContain("pl-1");
    expect(accountPill?.getAttribute("style")).not.toContain("border");
    const accountIcon = accountPill?.querySelector('[data-account-status-icon="not-linked"]');
    expect(accountIcon?.tagName).toBe("svg");
    expect(accountIcon?.querySelector(":scope > circle")).not.toBeNull();
  });

  it("uses check, time, and alert icons for account linkage states", () => {
    function renderAccountState({
      employee,
      pending = false,
    }: {
      employee: Employee;
      pending?: boolean;
    }) {
      const pendingInvites = pending
        ? new Map([[employee.id, {} as Invitation]])
        : new Map<string, Invitation>();

      return render(
        <table>
          <tbody>
            <StaffTableRow
              emp={employee}
              globalIndex={0}
              isExpanded={false}
              isReordering={false}
              isDragging={false}
              canManageEmployees={false}
              canViewEmployeeDetails
              showStatusColumn={false}
              canNavigateToDetailsPage={false}
              isSelected={false}
              focusAreas={[]}
              certifications={[]}
              roles={[]}
              pendingInviteByEmployeeId={pendingInvites}
              onToggleSelect={vi.fn()}
              onRowClick={vi.fn()}
            />
          </tbody>
        </table>,
      );
    }

    const linked = renderAccountState({
      employee: makeEmployee({ id: "linked", userId: "user-1", email: "linked@example.com" }),
    });
    expect(
      linked.getByLabelText("Account: Linked").querySelector('[data-account-status-icon="linked"]'),
    ).not.toBeNull();
    linked.unmount();

    const invited = renderAccountState({
      employee: makeEmployee({ id: "invited", email: "invited@example.com" }),
      pending: true,
    });
    expect(
      invited
        .getByLabelText("Account: Invited")
        .querySelector('[data-account-status-icon="invited"]'),
    ).not.toBeNull();
    invited.unmount();

    const notLinked = renderAccountState({
      employee: makeEmployee({ id: "not-linked", email: "available@example.com" }),
    });
    expect(
      notLinked
        .getByLabelText("Account: Not invited")
        .querySelector('[data-account-status-icon="not-linked"]'),
    ).not.toBeNull();
  });
});

describe("StaffReorderListRow date joined", () => {
  // Noon UTC, so the local calendar day is the same in every test zone.
  const JOINED = "2026-03-05T12:00:00.000Z";
  const ADDED = "2026-01-09T12:00:00.000Z";

  function dateCell(employee: Employee) {
    const { container } = render(
      <StaffReorderListRow
        emp={employee}
        globalIndex={0}
        isExpanded={false}
        isReordering={false}
        isDragging={false}
        canManageEmployees
        canViewEmployeeDetails
        showStatusColumn={false}
        canNavigateToDetailsPage
        isSelected={false}
        focusAreas={[]}
        certifications={[]}
        roles={[]}
        pendingInviteByEmployeeId={new Map()}
        onToggleSelect={vi.fn()}
        onRowClick={vi.fn()}
      />,
    );
    return container.querySelector(".dg-staff-directory-cell--date-joined")?.textContent;
  }

  function shortDate(iso: string) {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }

  it("shows when the person accepted, not when their record was added", () => {
    const cell = dateCell(makeEmployee({ userId: "user-1", createdAt: ADDED, joinedAt: JOINED }));

    expect(cell).toBe(shortDate(JOINED));
    expect(cell).not.toBe(shortDate(ADDED));
  });

  it("shows no date for someone who has not joined", () => {
    expect(dateCell(makeEmployee({ userId: null, createdAt: ADDED, joinedAt: null }))).toBe(
      "\u2014",
    );
  });
});
