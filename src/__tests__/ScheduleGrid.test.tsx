import type { ComponentProps } from "react";
import { render, screen } from "@testing-library/react";
import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";

import ScheduleGrid from "@/components/ScheduleGrid";
import { formatDateKey } from "@/lib/utils";
import type {
  CoverageRequirement,
  Department,
  DraftKind,
  Employee,
  FocusArea,
  IndicatorType,
  ShiftCategory,
  ShiftCode,
} from "@/types";

vi.mock("@/components/AuthProvider", () => ({
  useAuth: () => ({ user: null, signOut: vi.fn(), isLoading: false }),
}));

const focusAreas: FocusArea[] = [
  { id: 1, orgId: "org-1", departmentId: 1, name: "North", sortOrder: 1 },
  { id: 2, orgId: "org-1", departmentId: 1, name: "South", sortOrder: 2 },
];

const departments: Department[] = [
  {
    id: 1,
    orgId: "org-1",
    name: "Schedule",
    abbr: "SCH",
    type: "scheduled",
    sortOrder: 1,
  },
];

const shiftCategories: ShiftCategory[] = [
  {
    id: 1,
    orgId: "org-1",
    name: "Day",
    color: "#E5F3E8",
    sortOrder: 1,
  },
];

const shiftCodes: ShiftCode[] = [
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

const indicatorTypes: IndicatorType[] = [
  { id: 1, orgId: "org-1", name: "Flag", color: "#ff0000", sortOrder: 1 },
];

const employees: Employee[] = [
  {
    id: "emp-1",
    firstName: "Alex",
    lastName: "Taylor",
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

const week1 = Array.from({ length: 7 }, (_, index) => new Date(2024, 0, 7 + index));
const week2 = Array.from({ length: 7 }, (_, index) => new Date(2024, 0, 14 + index));

function getShiftStyleFromCodes(codes: ShiftCode[]) {
  return (type: string) =>
    codes.find((code) => code.label === type || code.name === type) ?? codes[0];
}

function makeShiftAccessors(
  codes: ShiftCode[],
  assignments: Record<string, number[]>,
) {
  const codeById = new Map(codes.map((code) => [code.id, code]));

  return {
    shiftCodeIdsForKey: (empId: string, date: Date) =>
      assignments[`${empId}_${formatDateKey(date)}`] ?? [],
    shiftForKey: (empId: string, date: Date) => {
      const codeIds = assignments[`${empId}_${formatDateKey(date)}`] ?? [];
      const labels = codeIds
        .map((codeId) => codeById.get(codeId)?.label)
        .filter((label): label is string => !!label);
      return labels.length > 0 ? labels.join("/") : null;
    },
  };
}

let observedWidth = 1600;
const originalResizeObserver = global.ResizeObserver;
const originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;

beforeAll(() => {
  global.ResizeObserver = class ResizeObserverMock {
    private callback: ResizeObserverCallback;

    constructor(callback: ResizeObserverCallback) {
      this.callback = callback;
    }

    observe() {
      this.callback(
        [
          {
            contentRect: {
              width: observedWidth,
              height: 0,
              x: 0,
              y: 0,
              top: 0,
              right: observedWidth,
              bottom: 0,
              left: 0,
              toJSON: () => ({}),
            },
          } as ResizeObserverEntry,
        ],
        this as unknown as ResizeObserver,
      );
    }

    disconnect() {}
    unobserve() {}
  } as typeof ResizeObserver;

  HTMLElement.prototype.getBoundingClientRect = function getBoundingClientRect() {
    return {
      width: observedWidth,
      height: 0,
      x: 0,
      y: 0,
      top: 0,
      right: observedWidth,
      bottom: 0,
      left: 0,
      toJSON: () => ({}),
    } as DOMRect;
  };
});

afterAll(() => {
  global.ResizeObserver = originalResizeObserver;
  HTMLElement.prototype.getBoundingClientRect = originalGetBoundingClientRect;
});

function renderGrid(extraProps: Partial<ComponentProps<typeof ScheduleGrid>> = {}) {
  const resolvedShiftCodes = extraProps.shiftCodes ?? shiftCodes;

  return render(
    <ScheduleGrid
      filteredEmployees={employees}
      allEmployees={employees}
      week1={week1}
      week2={week2}
      spanWeeks={2}
      shiftForKey={() => "D"}
      shiftCodeIdsForKey={() => [1]}
      getShiftStyle={getShiftStyleFromCodes(resolvedShiftCodes)}
      handleCellClick={() => {}}
      today={week1[0]}
      focusAreas={focusAreas}
      departments={departments}
      shiftCodes={resolvedShiftCodes}
      shiftCategories={shiftCategories}
      indicatorTypes={indicatorTypes}
      certifications={[]}
      orgRoles={[]}
      {...extraProps}
    />,
  );
}

describe("ScheduleGrid", () => {
  it("fits a wide 2-week compact code layout to the container", () => {
    observedWidth = 1600;
    const { container } = renderGrid();
    const root = container.firstElementChild as HTMLElement;

    expect(root.dataset.gridFit).toBe("true");
    expect(root.style.getPropertyValue("--dg-grid-name-col-current")).toBe("200px");
    expect(root.style.getPropertyValue("--dg-grid-col-min-current")).toBe("100px");
  });

  it("keeps readable min widths and taller cells for dense 2-week rows", () => {
    observedWidth = 1200;
    renderGrid({
      openShifts: [
        {
          id: "open-1",
          source: "calloff",
          focusAreaId: 1,
          date: "2024-01-07",
          shiftCodeIds: [1],
          shiftCodeLabel: "D",
          customStartTime: null,
          customEndTime: null,
          needed: 1,
        },
      ],
      draftKindForKey: () => "modified",
      createdByNameForKey: () => "Jamie",
    });

    const root = screen.getByLabelText("North schedule grid").closest("[data-grid-fit]") as HTMLElement;
    expect(root.dataset.gridFit).toBe("false");
    expect(root.style.getPropertyValue("--dg-grid-name-col-current")).toBe("220px");
    expect(root.style.getPropertyValue("--dg-grid-col-min-current")).toBe("88px");

    const firstCell = screen.getAllByRole("gridcell")[0] as HTMLElement;
    expect(firstCell.style.height).toBe("72px");
  });

  it("wraps open shift chips vertically inside narrow day cells", () => {
    observedWidth = 1200;
    const { container } = renderGrid({
      openShifts: [
        {
          id: "open-1",
          source: "calloff",
          focusAreaId: 1,
          date: "2024-01-07",
          shiftCodeIds: [1],
          shiftCodeLabel: "D",
          customStartTime: null,
          customEndTime: null,
          needed: 1,
        },
        {
          id: "open-2",
          source: "calloff",
          focusAreaId: 1,
          date: "2024-01-07",
          shiftCodeIds: [1],
          shiftCodeLabel: "D",
          customStartTime: null,
          customEndTime: null,
          needed: 2,
        },
      ],
      draftKindForKey: () => "modified",
      createdByNameForKey: () => "Jamie",
    });

    const openShiftButtons = container.querySelectorAll(".dg-open-shift-btn");
    expect(openShiftButtons).toHaveLength(2);

    const openShiftCell = openShiftButtons[0].parentElement as HTMLElement;
    expect(openShiftCell.style.flexWrap).toBe("wrap");
    expect(openShiftCell.style.gap).toBe("6px");
    expect(openShiftCell.style.minHeight).toBe("");
    expect((openShiftButtons[0] as HTMLElement).style.width).toBe("100%");
  });

  it("renders category rows with per-day totals", () => {
    observedWidth = 1600;

    const localEmployees: Employee[] = [
      employees[0],
      {
        ...employees[0],
        id: "emp-2",
        firstName: "Casey",
        lastName: "Jordan",
        seniority: 2,
      },
    ];
    const localShiftCodes: ShiftCode[] = [
      shiftCodes[0],
      {
        id: 2,
        orgId: "org-1",
        label: "N",
        name: "Night Shift",
        color: "#E0F2FE",
        border: "#0284C7",
        text: "#0C4A6E",
        categoryId: 1,
        focusAreaId: null,
        sortOrder: 2,
      },
    ];
    const accessors = makeShiftAccessors(localShiftCodes, {
      [`emp-1_${formatDateKey(week1[0])}`]: [1],
      [`emp-2_${formatDateKey(week1[0])}`]: [1],
      [`emp-1_${formatDateKey(week1[1])}`]: [2],
    });

    renderGrid({
      filteredEmployees: localEmployees,
      allEmployees: localEmployees,
      shiftCodes: localShiftCodes,
      shiftForKey: accessors.shiftForKey,
      shiftCodeIdsForKey: accessors.shiftCodeIdsForKey,
    });

    const northGrid = screen.getByLabelText("North schedule grid");
    const categoryRow = northGrid.querySelector(
      '[data-tally-row="category-1"]',
    ) as HTMLElement | null;

    expect(categoryRow).not.toBeNull();
    expect(
      northGrid.querySelector('[data-tally-label="Day"]'),
    ).toBeInTheDocument();
    expect(
      northGrid.querySelector('[data-tally-row="category-2"]'),
    ).toBeNull();
    expect(
      northGrid.querySelector('[data-tally-count="1-0"]')?.textContent,
    ).toBe("2");
    expect(
      northGrid.querySelector('[data-tally-count="1-1"]')?.textContent,
    ).toBe("1");
    expect(
      northGrid.querySelector('[data-tally-count="1-2"]')?.textContent,
    ).toBe("-");
  });

  it("keeps open shifts separate from footer totals", () => {
    observedWidth = 1600;

    const accessors = makeShiftAccessors(shiftCodes, {
      [`emp-1_${formatDateKey(week1[0])}`]: [1],
    });

    renderGrid({
      shiftForKey: accessors.shiftForKey,
      shiftCodeIdsForKey: accessors.shiftCodeIdsForKey,
      openShifts: [
        {
          id: "open-1",
          source: "calloff",
          focusAreaId: 1,
          date: "2024-01-07",
          shiftCodeIds: [1],
          shiftCodeLabel: "D",
          customStartTime: null,
          customEndTime: null,
          needed: 1,
        },
      ],
    });

    const northGrid = screen.getByLabelText("North schedule grid");
    expect(screen.getByText("Open Shifts")).toBeInTheDocument();
    expect(
      northGrid.querySelector('[data-tally-count="1-0"]')?.textContent,
    ).toBe("1");
  });

  it("colors covered category totals green and short staffing red", () => {
    observedWidth = 1600;

    const localRequirements: CoverageRequirement[] = [
      {
        id: 1,
        orgId: "org-1",
        focusAreaId: 1,
        shiftCodeId: 1,
        dayOfWeek: week1[0].getDay(),
        minStaff: 1,
      },
      {
        id: 2,
        orgId: "org-1",
        focusAreaId: 1,
        shiftCodeId: 1,
        dayOfWeek: week1[1].getDay(),
        minStaff: 2,
      },
      {
        id: 3,
        orgId: "org-1",
        focusAreaId: 1,
        shiftCodeId: 1,
        dayOfWeek: week1[2].getDay(),
        minStaff: 1,
      },
    ];
    const accessors = makeShiftAccessors(shiftCodes, {
      [`emp-1_${formatDateKey(week1[0])}`]: [1],
      [`emp-1_${formatDateKey(week1[1])}`]: [1],
    });

    renderGrid({
      shiftForKey: accessors.shiftForKey,
      shiftCodeIdsForKey: accessors.shiftCodeIdsForKey,
      coverageRequirements: localRequirements,
    });

    const northGrid = screen.getByLabelText("North schedule grid");
    const coveredCell = northGrid.querySelector(
      '[data-tally-count="1-0"]',
    ) as HTMLElement;
    const shortCell = northGrid.querySelector(
      '[data-tally-count="1-1"]',
    ) as HTMLElement;
    const zeroShortCell = northGrid.querySelector(
      '[data-tally-count="1-2"]',
    ) as HTMLElement;

    expect(coveredCell.dataset.tallyStatus).toBe("covered");
    expect(coveredCell.style.background).toBe("rgba(22, 163, 74, 0.12)");
    expect(shortCell.dataset.tallyStatus).toBe("short");
    expect(shortCell.style.background).toBe("rgba(220, 38, 38, 0.12)");
    expect(zeroShortCell.dataset.tallyStatus).toBe("short");
    expect(zeroShortCell.textContent).toBe("0");
  });

  it("excludes foreign focus-area shifts from totals while counting section and global shifts", () => {
    observedWidth = 1600;

    const localShiftCodes: ShiftCode[] = [
      shiftCodes[0],
      {
        id: 2,
        orgId: "org-1",
        label: "N",
        name: "Night Shift",
        color: "#E0F2FE",
        border: "#0284C7",
        text: "#0C4A6E",
        categoryId: 1,
        focusAreaId: null,
        sortOrder: 2,
      },
      {
        id: 3,
        orgId: "org-1",
        label: "E",
        name: "Evening Shift",
        color: "#FCE7F3",
        border: "#DB2777",
        text: "#9D174D",
        categoryId: 1,
        focusAreaId: 2,
        sortOrder: 3,
      },
    ];
    const accessors = makeShiftAccessors(localShiftCodes, {
      [`emp-1_${formatDateKey(week1[0])}`]: [3],
      [`emp-1_${formatDateKey(week1[1])}`]: [1],
      [`emp-1_${formatDateKey(week1[2])}`]: [2],
    });

    renderGrid({
      shiftCodes: localShiftCodes,
      shiftForKey: accessors.shiftForKey,
      shiftCodeIdsForKey: accessors.shiftCodeIdsForKey,
    });

    const northGrid = screen.getByLabelText("North schedule grid");

    expect(
      northGrid.querySelectorAll("[data-tally-row]").length,
    ).toBe(1);
    expect(
      northGrid.querySelector('[data-tally-count="1-0"]')?.textContent,
    ).toBe("-");
    expect(
      northGrid.querySelector('[data-tally-count="1-1"]')?.textContent,
    ).toBe("1");
    expect(
      northGrid.querySelector('[data-tally-count="1-2"]')?.textContent,
    ).toBe("1");
  });

  it("keeps a section visible when it only has open shifts", () => {
    observedWidth = 1200;
    renderGrid({
      filteredEmployees: [],
      allEmployees: [],
      openShifts: [
        {
          id: "open-1",
          source: "calloff",
          focusAreaId: 1,
          date: "2024-01-07",
          shiftCodeIds: [1],
          shiftCodeLabel: "D",
          customStartTime: null,
          customEndTime: null,
          needed: 1,
        },
      ],
    });

    expect(screen.getByLabelText("North schedule grid")).toBeInTheDocument();
    expect(screen.getByText("Open Shifts")).toBeInTheDocument();
    expect(
      screen.getByLabelText("North schedule grid").querySelector("[data-tally-row]"),
    ).toBeNull();
    expect(screen.queryByText("No staff added yet")).not.toBeInTheDocument();
  });

  it("does not show OFF for draft-deleted shifts", () => {
    observedWidth = 1600;
    renderGrid({
      shiftForKey: () => null,
      shiftCodeIdsForKey: () => [],
      showDiffOverlay: true,
      draftKindForKey: () => "deleted" satisfies DraftKind,
      publishedLabelForKey: () => "D",
    });

    expect(screen.queryAllByText("Deleted").length).toBeGreaterThan(0);
    expect(screen.queryByText("OFF")).not.toBeInTheDocument();
  });

  it("marks only the selected editor cell for preview", () => {
    observedWidth = 1600;
    renderGrid({
      selectedCellKey: "emp-1_2024-01-08",
    });

    const cells = screen.getAllByRole("gridcell") as HTMLElement[];
    const selectedCells = cells.filter(
      (cell) => cell.dataset.selectedPreview === "true",
    );

    expect(selectedCells).toHaveLength(1);
    expect(cells[1]).toHaveAttribute("data-selected-preview", "true");
    expect(cells[0]).toHaveAttribute("data-selected-preview", "false");
    expect(cells[2]).toHaveAttribute("data-selected-preview", "false");
    expect(cells[1].style.boxShadow).toContain("var(--color-border-focus)");
  });

  it("keeps special cell states visible when selected preview is active", () => {
    observedWidth = 1600;
    renderGrid({
      selectedCellKey: "emp-1_2024-01-07",
      cellLocks: new Map([["emp-1_2024-01-07", { userName: "Jamie" }]]),
    });

    const selectedCell = screen.getAllByRole("gridcell")[0] as HTMLElement;

    expect(selectedCell).toHaveAttribute("data-locked", "true");
    expect(selectedCell).toHaveAttribute("data-selected-preview", "true");
    expect(selectedCell.style.background).toBe("rgba(37, 99, 235, 0.08)");
    expect(selectedCell.style.boxShadow).toContain("var(--color-border-focus)");
  });
});
