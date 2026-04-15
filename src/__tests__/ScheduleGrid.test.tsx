import type { ComponentProps } from "react";
import { render, screen } from "@testing-library/react";
import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";

import ScheduleGrid from "@/components/ScheduleGrid";
import type {
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
  return render(
    <ScheduleGrid
      filteredEmployees={employees}
      allEmployees={employees}
      week1={week1}
      week2={week2}
      spanWeeks={2}
      shiftForKey={() => "D"}
      shiftCodeIdsForKey={() => [1]}
      getShiftStyle={() => shiftCodes[0]}
      handleCellClick={() => {}}
      today={week1[0]}
      focusAreas={focusAreas}
      departments={departments}
      shiftCodes={shiftCodes}
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
});
