import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import * as fc from "fast-check";
import StaffView from "@/components/StaffView";
import { Employee, FocusArea, NamedItem } from "@/types";
const DESIGNATIONS: NamedItem[] = [
  { id: 1, orgId: "org-1", name: "JLCSN", abbr: "JLCSN", sortOrder: 0 },
  { id: 2, orgId: "org-1", name: "CSN III", abbr: "CSN III", sortOrder: 1 },
  { id: 3, orgId: "org-1", name: "CSN II", abbr: "CSN II", sortOrder: 2 },
  { id: 4, orgId: "org-1", name: "STAFF", abbr: "STAFF", sortOrder: 3 },
  { id: 5, orgId: "org-1", name: "—", abbr: "—", sortOrder: 4 },
];
const ROLES: NamedItem[] = [
  { id: 1, orgId: "org-1", name: "DCSN", abbr: "DCSN", sortOrder: 0 },
  { id: 2, orgId: "org-1", name: "DVCSN", abbr: "DVCSN", sortOrder: 1 },
  { id: 3, orgId: "org-1", name: "Supv", abbr: "Supv", sortOrder: 2 },
  { id: 4, orgId: "org-1", name: "Mentor", abbr: "Mentor", sortOrder: 3 },
  { id: 5, orgId: "org-1", name: "CN", abbr: "CN", sortOrder: 4 },
  { id: 6, orgId: "org-1", name: "SC. Mgr.", abbr: "SC. Mgr.", sortOrder: 5 },
  { id: 7, orgId: "org-1", name: "Activity Coordinator", abbr: "Activity Coordinator", sortOrder: 6 },
  { id: 8, orgId: "org-1", name: "SC/Asst/Act/Cor", abbr: "SC/Asst/Act/Cor", sortOrder: 7 },
];

vi.mock("@/components/EditEmployeePanel", () => ({
  default: () => <div data-testid="edit-panel" />,
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/staff",
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: any) => <a href={href} {...rest}>{children}</a>,
}));

vi.mock("@/components/AuthProvider", () => ({
  useAuth: () => ({ user: null, signOut: vi.fn(), isLoading: false }),
}));

vi.mock("@/components/ui/sidebar", () => {
  const passthrough = ({ children }: any) => <>{children}</>;
  return {
    SidebarProvider: passthrough,
    SidebarInset: ({ children, ...props }: any) => <main {...props}>{children}</main>,
    Sidebar: () => <div data-testid="mock-sidebar" />,
    SidebarContent: passthrough,
    SidebarGroup: passthrough,
    SidebarGroupContent: passthrough,
    SidebarMenu: passthrough,
    SidebarMenuItem: passthrough,
    SidebarMenuButton: passthrough,
    SidebarFooter: passthrough,
  };
});

// Mock base-ui popover to avoid Floating UI positioning overhead in jsdom.
// Root always renders children so Trigger stays visible; Popup content is always present in tests.
vi.mock("@base-ui/react/popover", () => {
  const passthrough = ({ children }: any) => <>{children}</>;
  return {
    Popover: {
      Root: passthrough,
      Trigger: ({ children, render, ...props }: any) => <button {...props}>{children}</button>,
      Portal: passthrough,
      Positioner: passthrough,
      Popup: ({ children, className }: any) => <div className={className}>{children}</div>,
    },
  };
});

const focusAreas: FocusArea[] = [
  {
    id: 1,
    orgId: "org-1",
    name: "North",
    colorBg: "#EFF6FF",
    colorText: "#1D4ED8",
    sortOrder: 1,
  },
];

const employees: Employee[] = [
  {
    id: "emp-1",
    firstName: "Alice",
    lastName: "Smith",
    status: "active",
    statusChangedAt: null,
    statusNote: "",
    certificationId: 4,
    roleIds: [],
    seniority: 2,
    focusAreaIds: [1],
    phone: "",
    email: "",
    contactNotes: "",
    userId: null,
  },
  {
    id: "emp-2",
    firstName: "Bob",
    lastName: "Jones",
    status: "active",
    statusChangedAt: null,
    statusNote: "",
    certificationId: 3,
    roleIds: [],
    seniority: 1,
    focusAreaIds: [1],
    phone: "",
    email: "",
    contactNotes: "",
    userId: null,
  },
];

const defaultCertifications = [...DESIGNATIONS];
const defaultRoles = [...ROLES];

const defaultProps = {
  employees,
  focusAreas,
  certifications: defaultCertifications,
  roles: defaultRoles,
  onSave: vi.fn(),
  onDelete: vi.fn(),
  onBench: vi.fn(),
  onActivate: vi.fn(),
  onAdd: vi.fn(),
  canManageEmployees: true,
};

describe("StaffView", () => {
  describe("Controls", () => {
    it("renders 'Add' button", () => {
      render(<StaffView {...defaultProps} />);
      expect(screen.getByRole("button", { name: /Add/ })).toBeInTheDocument();
    });

    it("clicking 'Add' button calls onAdd", async () => {
      const onAdd = vi.fn();
      render(<StaffView {...defaultProps} onAdd={onAdd} />);
      await userEvent.click(screen.getByRole("button", { name: /Add/ }));
      expect(onAdd).toHaveBeenCalledTimes(1);
    });

    it("renders sort selector with Seniority as default", async () => {
      render(<StaffView {...defaultProps} />);
      // Sort trigger shows current sort via aria-label
      expect(screen.getByRole("button", { name: /Sort by Seniority/ })).toBeInTheDocument();
    });
  });

  describe("Expand/collapse", () => {
    it("clicking an employee row expands the inline editor", async () => {
      render(<StaffView {...defaultProps} />);
      expect(screen.queryByTestId("edit-panel")).not.toBeInTheDocument();
      await userEvent.click(screen.getByText("Alice Smith"));
      expect(screen.getByTestId("edit-panel")).toBeInTheDocument();
    });

    it("clicking the same expanded row again collapses the editor", async () => {
      render(<StaffView {...defaultProps} />);
      await userEvent.click(screen.getByText("Alice Smith"));
      expect(screen.getByTestId("edit-panel")).toBeInTheDocument();
      // Name appears in both the table row and the detail panel header;
      // click the first one (the table row) to collapse
      await userEvent.click(screen.getAllByText("Alice Smith")[0]);
      expect(screen.queryByTestId("edit-panel")).not.toBeInTheDocument();
    });
  });

  describe("Avatar", () => {
    it("renders initials 'AS' for Alice Smith", () => {
      render(<StaffView {...defaultProps} />);
      expect(screen.getByText("AS")).toBeInTheDocument();
    });

    it("renders initials 'BJ' for Bob Jones", () => {
      render(<StaffView {...defaultProps} />);
      expect(screen.getByText("BJ")).toBeInTheDocument();
    });
  });

  describe("Employee count", () => {
    it("renders both employees in the list", () => {
      render(<StaffView {...defaultProps} />);
      expect(screen.getByText("Alice Smith")).toBeInTheDocument();
      expect(screen.getByText("Bob Jones")).toBeInTheDocument();
    });
  });
});

// Feature: ui-ux-test-suite, Property 3: Seniority sort produces non-decreasing sequence
// Feature: ui-ux-test-suite, Property 4: Name sort produces non-decreasing alphabetical sequence
describe("Property-based tests", () => {
  const arbUniqueEmployees = fc
    .array(
      fc.record({
        firstName: fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0 && /[a-zA-Z]/.test(s)),
        lastName: fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0 && /[a-zA-Z]/.test(s)),
        status: fc.constant("active" as const),
        statusChangedAt: fc.constant(null as string | null),
        statusNote: fc.constant(""),
        certificationId: fc.oneof(fc.constant(null as number | null), fc.constantFrom(...DESIGNATIONS.map((d) => d.id))),
        roleIds: fc.array(fc.constantFrom(...ROLES.map((r) => r.id))).map(ids => [...new Set(ids)]),
        seniority: fc.integer({ min: 1, max: 999 }),
        focusAreaIds: fc.array(fc.integer({ min: 1, max: 10 }), {
          minLength: 1,
        }).map(ids => [...new Set(ids)]),
        phone: fc.string(),
        email: fc.string(),
        contactNotes: fc.string(),
        userId: fc.constant(null as string | null),
      }),
      { minLength: 1, maxLength: 20 },
    )
    .map((emps) =>
      emps.map((emp, idx) => ({
        ...emp,
        id: `emp-${idx + 1}`,
      })),
    );

  it("seniority sort produces non-decreasing sequence", { timeout: 15000 }, async () => {
    // Validates: Requirements 5.4, 8.2
    await fc.assert(
      fc.asyncProperty(arbUniqueEmployees, async (emps) => {
        const { unmount, container } = render(
          <StaffView
            employees={emps}
            focusAreas={[]}
            certifications={defaultCertifications}
            roles={defaultRoles}
            onSave={vi.fn()}
            onDelete={vi.fn()}
            onBench={vi.fn()}
            onActivate={vi.fn()}
            onAdd={vi.fn()}
          />,
        );

        // Seniority sort is the default — no interaction needed
        const tableContainer = container.querySelector('[data-testid="staff-table"]') as HTMLElement;

        // Employee data rows: skip the header row (first child), get remaining row wrappers
        const allRowWrappers = Array.from(tableContainer.children).slice(1);

        // Each wrapper's first child is the grid row div; its first child div is the seniority cell
        const seniorityValues = allRowWrappers.map((wrapper) => {
          const gridRow = wrapper.children[0] as HTMLElement;
          const seniorityCell = gridRow.children[0] as HTMLElement;
          return parseInt(seniorityCell.textContent ?? "0", 10);
        });

        // Assert non-decreasing order
        for (let i = 0; i < seniorityValues.length - 1; i++) {
          if (seniorityValues[i] > seniorityValues[i + 1]) {
            unmount();
            return false;
          }
        }

        unmount();
        return true;
      }),
      { numRuns: 100 },
    );
  });

  it(
    "name sort produces non-decreasing alphabetical sequence",
    { timeout: 15000 },
    async () => {
      // Validates: Requirements 5.5
      // Use a dedicated arbitrary with unique ids to avoid React key conflicts

      await fc.assert(
        fc.asyncProperty(arbUniqueEmployees, async (emps) => {
          // The component sorts by firstName then lastName.
          // Verify the rendered order matches that sort.
          const expected = [...emps].sort(
            (a, b) => a.firstName.localeCompare(b.firstName) || a.lastName.localeCompare(b.lastName),
          );

          const { unmount, container } = render(
            <StaffView
              employees={emps}
              focusAreas={[]}
              certifications={defaultCertifications}
              roles={defaultRoles}
              onSave={vi.fn()}
              onDelete={vi.fn()}
              onBench={vi.fn()}
              onActivate={vi.fn()}
              onAdd={vi.fn()}
            />,
          );

          // Click "Name" sort option (mock renders all options always)
          await userEvent.click(screen.getByRole("button", { name: "Name" }));

          const tableContainer = container.querySelector('[data-testid="staff-table"]') as HTMLElement;

          // Employee data rows: skip the header row (first child), get remaining row wrappers
          const allRowWrappers = Array.from(tableContainer.children).slice(1);

          // Each wrapper's first child is the grid row div
          // gridRow.children[1] = name+avatar cell
          // nameCell.children[1] = inner div containing name div + optional contact
          // innerDiv.children[0] = name div whose textContent starts with emp.name
          // The name div may contain an FTE badge <span> — grab only the first text node (no trim)
          const names = allRowWrappers.map((wrapper) => {
            const gridRow = wrapper.children[0] as HTMLElement;
            const nameCell = gridRow.children[1] as HTMLElement;
            const innerDiv = nameCell.children[1] as HTMLElement;
            const nameDiv = innerDiv.children[0] as HTMLElement;
            // First text node is the raw name string (before any badge span)
            return nameDiv.childNodes[0]?.textContent ?? "";
          });

          unmount();

          // Compare rendered order against expected order (firstName then lastName)
          const expectedNames = expected.map((e) => `${e.firstName} ${e.lastName}`.trim());
          for (let i = 0; i < expectedNames.length; i++) {
            if (names[i] !== expectedNames[i]) return false;
          }
          return true;
        }),
        { numRuns: 100 },
      );
    },
  );

});
