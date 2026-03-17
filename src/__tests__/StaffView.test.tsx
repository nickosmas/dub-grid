import { render, screen, within } from "@testing-library/react";
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
    name: "Alice Smith",
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
  },
  {
    id: "emp-2",
    name: "Bob Jones",
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

    it("renders sort selector with Seniority as default", () => {
      render(<StaffView {...defaultProps} />);
      // Sort is now a CustomSelect dropdown; the trigger shows the current value
      expect(screen.getByRole("button", { name: /Seniority/ })).toBeInTheDocument();
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
      await userEvent.click(screen.getByText("Alice Smith"));
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
// Feature: ui-ux-test-suite, Property 5: Focus area sort ordering
describe("Property-based tests", () => {
  const arbUniqueEmployees = fc
    .array(
      fc.record({
        name: fc.string({ minLength: 1, maxLength: 40 }),
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

        // Open sort dropdown and click "Seniority" to ensure seniority sort is active
        await userEvent.click(
          within(container).getByRole("button", { name: /Seniority/ }),
        );

        // StaffView renders sidebar (children[0]) + content area (children[1]).
        // Content area > MembersSection root (children[0]) > table card (children[2]).
        // children[0] = status tabs, children[1] = controls, children[2] = table
        const rootDiv = container.children[0] as HTMLElement;
        const contentArea = rootDiv.children[1] as HTMLElement;
        const membersSectionRoot = contentArea.children[0] as HTMLElement;
        const tableContainer = membersSectionRoot.children[2] as HTMLElement;

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

          // Open sort dropdown and click "Name"
          await userEvent.click(
            within(container).getByRole("button", { name: /Seniority/ }),
          );
          await userEvent.click(screen.getByRole("button", { name: "Name" }));

          // StaffView renders sidebar (children[0]) + content area (children[1]).
          // Content area > MembersSection root (children[0]).
          // children[0] = status tabs, children[1] = controls, children[2] = table
          const rootDiv = container.children[0] as HTMLElement;
          const contentArea = rootDiv.children[1] as HTMLElement;
          const membersSectionRoot = contentArea.children[0] as HTMLElement;
          const tableContainer = membersSectionRoot.children[2] as HTMLElement;

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

          // Assert non-decreasing alphabetical order
          for (let i = 0; i < names.length - 1; i++) {
            if (names[i].localeCompare(names[i + 1]) > 0) {
              unmount();
              return false;
            }
          }

          unmount();
          return true;
        }),
        { numRuns: 100 },
      );
    },
  );

  it(
    "focus area sort: first focus area alphabetical, ties broken by seniority",
    { timeout: 15000 },
    async () => {
      // Validates: Requirements 5.6
      // Use unique ids to avoid React key conflicts

      await fc.assert(
        fc.asyncProperty(arbUniqueEmployees, async (emps) => {
          // With empty focusAreas prop, all focus area names resolve to "" so
          // sort falls through to seniority
          const expected = [...emps].sort((a, b) => a.seniority - b.seniority);

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

          // Open sort dropdown and click "Focus Areas" (use getAllByRole since sidebar also has this label)
          await userEvent.click(
            within(container).getByRole("button", { name: /Seniority/ }),
          );
          const focusAreaBtns = screen.getAllByRole("button", { name: "Focus Areas" });
          // The portaled dropdown option is the last one added to the DOM
          await userEvent.click(focusAreaBtns[focusAreaBtns.length - 1]);

          // Read rendered names from the DOM (same structure as name sort test)
          // children[0] = status tabs, children[1] = controls, children[2] = table
          const rootDiv = container.children[0] as HTMLElement;
          const contentArea = rootDiv.children[1] as HTMLElement;
          const membersSectionRoot = contentArea.children[0] as HTMLElement;
          const tableContainer = membersSectionRoot.children[2] as HTMLElement;
          const allRowWrappers = Array.from(tableContainer.children).slice(1);

          const renderedNames = allRowWrappers.map((wrapper) => {
            const gridRow = wrapper.children[0] as HTMLElement;
            const nameCell = gridRow.children[1] as HTMLElement;
            const innerDiv = nameCell.children[1] as HTMLElement;
            const nameDiv = innerDiv.children[0] as HTMLElement;
            return nameDiv.childNodes[0]?.textContent ?? "";
          });

          unmount();

          // Compare rendered order against expected order by name
          const expectedNames = expected.map((e) => e.name);
          for (let i = 0; i < expectedNames.length; i++) {
            if (renderedNames[i] !== expectedNames[i]) return false;
          }
          return true;
        }),
        { numRuns: 100 },
      );
    },
  );
});
