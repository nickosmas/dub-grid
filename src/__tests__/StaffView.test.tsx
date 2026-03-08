import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import * as fc from "fast-check";
import StaffView from "@/components/StaffView";
import { Employee, Wing } from "@/types";
const DESIGNATIONS = ["JLCSN", "CSN III", "CSN II", "STAFF", "—"] as const;
const ROLES = [
  "DCSN", "DVCSN", "Supv", "Mentor", "CN", "SC. Mgr.", "Activity Coordinator", "SC/Asst/Act/Cor",
] as const;

vi.mock("@/components/EditEmployeePanel", () => ({
  default: () => <div data-testid="edit-panel" />,
}));

const wings: Wing[] = [
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
    designation: "STAFF",
    roles: [],
    fteWeight: 1.0,
    seniority: 2,
    wings: ["North"],
    phone: "",
    email: "",
    contactNotes: "",
  },
  {
    id: "emp-2",
    name: "Bob Jones",
    designation: "CSN II",
    roles: [],
    fteWeight: 0.5,
    seniority: 1,
    wings: ["North"],
    phone: "",
    email: "",
    contactNotes: "",
  },
];

const defaultSkillLevels = [...DESIGNATIONS as unknown as string[]];
const defaultRoles = [...ROLES as unknown as string[]];

const defaultProps = {
  employees,
  wings,
  skillLevels: defaultSkillLevels,
  roles: defaultRoles,
  onSave: vi.fn(),
  onDelete: vi.fn(),
  onAdd: vi.fn(),
};

describe("StaffView", () => {
  describe("Controls", () => {
    it("renders '+ Add Employee' button", () => {
      render(<StaffView {...defaultProps} />);
      expect(screen.getByText("+ Add Employee")).toBeInTheDocument();
    });

    it("clicking '+ Add Employee' calls onAdd", async () => {
      const onAdd = vi.fn();
      render(<StaffView {...defaultProps} onAdd={onAdd} />);
      await userEvent.click(screen.getByText("+ Add Employee"));
      expect(onAdd).toHaveBeenCalledTimes(1);
    });

    it("renders sort buttons 'Seniority', 'Name', 'Assigned Wings'", () => {
      render(<StaffView {...defaultProps} />);
      expect(
        screen.getByRole("button", { name: "Seniority" }),
      ).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Name" })).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Assigned Wings" }),
      ).toBeInTheDocument();
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

  describe("FTE badge", () => {
    it("shows FTE badge with value when fteWeight < 1", () => {
      render(<StaffView {...defaultProps} />);
      // Bob has fteWeight=0.5
      expect(screen.getByText("0.5")).toBeInTheDocument();
    });

    it("does not show FTE badge when fteWeight >= 1", () => {
      // Render only Alice (fteWeight=1.0) to avoid Bob's badge
      render(<StaffView {...defaultProps} employees={[employees[0]]} />);
      // The FTE badge is a <span> — there should be no span with "1" as text
      const spans = document.querySelectorAll("span");
      const fteBadge = Array.from(spans).find((s) => s.textContent === "1");
      expect(fteBadge).toBeUndefined();
    });
  });
});

// Feature: ui-ux-test-suite, Property 3: Seniority sort produces non-decreasing sequence
// Feature: ui-ux-test-suite, Property 4: Name sort produces non-decreasing alphabetical sequence
// Feature: ui-ux-test-suite, Property 5: Wing sort ordering
describe("Property-based tests", () => {
  const arbUniqueEmployees = fc
    .array(
      fc.record({
        name: fc.string({ minLength: 1, maxLength: 40 }),
        designation: fc.constantFrom(...DESIGNATIONS),
        roles: fc.array(fc.constantFrom(...ROLES)),
        fteWeight: fc.float({ min: Math.fround(0.1), max: Math.fround(1.0) }),
        seniority: fc.integer({ min: 1, max: 999 }),
        wings: fc.array(fc.string({ minLength: 1, maxLength: 20 }), {
          minLength: 1,
        }),
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
        roles: Array.from(new Set(emp.roles)) as typeof emp.roles,
        wings: Array.from(new Set(emp.wings)),
      })),
    );

  it("seniority sort produces non-decreasing sequence", async () => {
    // Validates: Requirements 5.4, 8.2
    await fc.assert(
      fc.asyncProperty(arbUniqueEmployees, async (emps) => {
        const { unmount, container } = render(
          <StaffView
            employees={emps}
            wings={[]}
            skillLevels={defaultSkillLevels}
            roles={defaultRoles}
            onSave={vi.fn()}
            onDelete={vi.fn()}
            onAdd={vi.fn()}
          />,
        );

        // Click "Seniority" sort button to ensure seniority sort is active
        await userEvent.click(
          within(container).getByRole("button", { name: "Seniority" }),
        );

        // The table container is the second child of the root div (first is controls)
        const rootDiv = container.children[0] as HTMLElement;
        const tableContainer = rootDiv.children[1] as HTMLElement;

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
              wings={[]}
              skillLevels={defaultSkillLevels}
              roles={defaultRoles}
              onSave={vi.fn()}
              onDelete={vi.fn()}
              onAdd={vi.fn()}
            />,
          );

          // Click "Name" sort button
          await userEvent.click(
            within(container).getByRole("button", { name: "Name" }),
          );

          // The table container is the second child of the root div (first is controls)
          const rootDiv = container.children[0] as HTMLElement;
          const tableContainer = rootDiv.children[1] as HTMLElement;

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
    "wing sort: first wing alphabetical, ties broken by seniority",
    { timeout: 15000 },
    async () => {
      // Validates: Requirements 5.6
      // Use unique ids to avoid React key conflicts

      await fc.assert(
        fc.asyncProperty(arbUniqueEmployees, async (emps) => {
          // Compute expected order using the same comparator as StaffView
          const expected = [...emps].sort((a, b) => {
            const wA = a.wings[0] ?? "";
            const wB = b.wings[0] ?? "";
            return wA !== wB ? wA.localeCompare(wB) : a.seniority - b.seniority;
          });

          const { unmount, container } = render(
            <StaffView
              employees={emps}
              wings={[]}
              skillLevels={defaultSkillLevels}
              roles={defaultRoles}
              onSave={vi.fn()}
              onDelete={vi.fn()}
              onAdd={vi.fn()}
            />,
          );

          // Click "Assigned Wings" sort button
          await userEvent.click(
            within(container).getByRole("button", { name: "Assigned Wings" }),
          );

          // Read rendered names from the DOM (same structure as name sort test)
          const rootDiv = container.children[0] as HTMLElement;
          const tableContainer = rootDiv.children[1] as HTMLElement;
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
