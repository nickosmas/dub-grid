import type { AbsencePillLayout } from "@/lib/absence-pill";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import PrintScheduleView, { gridEquivalentColumnWidth } from "@/components/PrintScheduleView";
import { PRINT_PILL_RADIUS } from "@/components/PrintShiftPill";
import { PRINT_INK } from "@/components/print-palette";
import { stacksShifts } from "@/components/schedule-grid/gridHelpers";
import { buildPrintDocument, collectFontFaceCss } from "@/components/print-document";
import type { ScheduleNoteMark } from "@/components/schedule-grid/noteDots";
import { formatDateKey } from "@/lib/utils";
import type {
  AbsenceType,
  AssignmentDefinition,
  Employee,
  FocusArea,
  IndicatorType,
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

const nightSouth: AssignmentDefinition = {
  id: 2,
  orgId: "org-1",
  label: "N",
  name: "Night Shift",
  color: "#EDE4FF",
  border: "#3D1F7A",
  text: "#3D1F7A",
  categoryId: 1,
  focusAreaId: 2,
  sortOrder: 2,
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

const indicatorTypes: IndicatorType[] = [
  { id: 80, orgId: "org-1", name: "Float", color: "#ff0000", sortOrder: 1 },
  { id: 81, orgId: "org-1", name: "Training", color: "#0000ff", sortOrder: 2 },
];

function renderPrintView(indicators?: {
  noteMarksForKey: (empId: string, date: Date, focusAreaId?: number) => ScheduleNoteMark[];
  /** Fill every day with the first shift instead of the week of Vacation. */
  worked?: boolean;
}) {
  const worked = indicators?.worked ?? false;
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
      shiftForKey={() => (worked ? assignments[0].label : vacation.label)}
      assignmentIdsForKey={() => (worked ? [assignments[0].id] : [])}
      absenceTypeIdForKey={() => (worked ? null : vacation.id)}
      absenceTypeMap={new Map([[vacation.id, vacation]])}
      getShiftStyle={() => assignments[0]}
      onClose={() => {}}
      noteMarksForKey={indicators?.noteMarksForKey}
      indicatorTypes={indicators ? indicatorTypes : undefined}
    />,
  );
}

describe("PrintScheduleView", () => {
  it("prints a whole-day absence on days in a row as one bar in its own colors (item 52)", () => {
    const { container } = renderPrintView();

    const bars = container.querySelectorAll<HTMLElement>("[data-print-absence-run]");
    expect(bars).toHaveLength(1);
    expect(bars[0].dataset.printAbsenceRun).toBe("7");
    expect(bars[0].textContent).toBe("Vacation or Flex ×7");
    expect(bars[0].style.background).toContain("repeating-linear-gradient(135deg");
    expect(bars[0].style.borderStyle).toBe("dashed");
    expect(container.querySelectorAll("[data-print-pill]")).toHaveLength(0);
  });

  it("breaks an absence bar at the week and prints a lone day as its own pill", () => {
    // A gap on the second Friday leaves Saturday on its own.
    const gapDay = formatDateKey(new Date(2024, 0, 19));
    const { container } = render(
      <PrintScheduleView
        weekStart={new Date(2024, 0, 7)}
        config={{ fontSize: 11, selectedFocusAreas: ["North"], spanWeeks: 2 }}
        employees={employees}
        allEmployees={employees}
        focusAreas={focusAreas}
        assignments={assignments}
        shiftCategories={shiftCategories}
        jobs={[]}
        certifications={[]}
        orgRoles={[]}
        shiftForKey={(_, date) => (formatDateKey(date) === gapDay ? null : vacation.label)}
        assignmentIdsForKey={() => []}
        absenceTypeIdForKey={(_, date) => (formatDateKey(date) === gapDay ? null : vacation.id)}
        absenceTypeMap={new Map([[vacation.id, vacation]])}
        getShiftStyle={() => assignments[0]}
        onClose={() => {}}
      />,
    );

    const bars = Array.from(container.querySelectorAll<HTMLElement>("[data-print-absence-run]"));
    expect(bars.map((bar) => bar.textContent)).toEqual([
      "Vacation or Flex ×7",
      "Vacation or Flex ×5",
    ]);
    const pills = Array.from(container.querySelectorAll("[data-print-pill]"));
    expect(pills.map((pill) => pill.textContent)).toEqual([vacation.label]);
  });

  // 42a: the printout shows each cell's indicators and keys only those present.
  describe("indicators", () => {
    const firstDay = formatDateKey(new Date(2024, 0, 7));

    it("prints a cell's indicators and keys only the ones that appear", () => {
      const { container } = renderPrintView({
        worked: true,
        noteMarksForKey: (_, date, focusAreaId) =>
          formatDateKey(date) === firstDay && focusAreaId === 1
            ? [{ indicatorTypeId: 80, state: "published" }]
            : [],
      });

      const marks = container.querySelectorAll<HTMLElement>("[data-print-indicators]");
      expect(Array.from(marks).map((mark) => mark.getAttribute("aria-label"))).toEqual([
        "Schedule notes: Float",
      ]);
      // In the pill's bottom-right corner, as on the grid.
      const [mark] = marks;
      expect(mark.closest("[data-print-pill]")).not.toBeNull();
      expect(mark.style.position).toBe("absolute");
      expect(mark.style.bottom).not.toBe("");
      expect(mark.style.top).toBe("");
      expect(mark.querySelectorAll("[data-print-note-dot]")).toHaveLength(1);

      // The key names each note beside its own dot, so a colour on paper reads.
      const legend = container.querySelector<HTMLElement>("[data-print-indicator-legend]");
      expect(legend?.textContent).toContain("Float");
      expect(legend?.textContent).not.toContain("Training");
      const keyDot = legend?.querySelector<HTMLElement>('[data-print-key-note-dot="80"]');
      expect(keyDot?.style.background).not.toBe("");
      expect(keyDot?.style.boxShadow).toContain(PRINT_INK.text.toLowerCase().replace("#", ""));
      expect(legend?.querySelector("svg")).toBeNull();
    });

    it("prints two dots and counts the rest, as on the grid", () => {
      const { container } = renderPrintView({
        worked: true,
        noteMarksForKey: (_, date) =>
          formatDateKey(date) === formatDateKey(new Date(2024, 0, 7))
            ? [80, 81, 99].map((indicatorTypeId) => ({
                indicatorTypeId,
                state: "published" as const,
              }))
            : [],
      });

      const [mark] = container.querySelectorAll<HTMLElement>("[data-print-indicators]");
      expect(mark.querySelectorAll("[data-print-note-dot]")).toHaveLength(2);
      expect(mark.querySelector("[data-print-note-more]")?.textContent).toBe("+1");
      expect(mark.getAttribute("aria-label")).toBe(
        "Schedule notes: Float, Training, Schedule note",
      );
    });

    it("prints no indicator key when no indicator appears", () => {
      const { container } = renderPrintView({ noteMarksForKey: () => [] });

      expect(container.querySelector("[data-print-indicator-legend]")).toBeNull();
      expect(container.querySelector("[data-print-indicators]")).toBeNull();
    });

    it("uses literal colours, since the print window has no app CSS variables", () => {
      const { container } = renderPrintView({
        worked: true,
        noteMarksForKey: () => [{ indicatorTypeId: 99, state: "published" }],
      });

      const markup = Array.from(container.querySelectorAll("[data-print-indicators]"))
        .map((element) => element.outerHTML)
        .join("");
      expect(markup).not.toContain("var(--");
      expect(markup).toContain('aria-label="Schedule notes: Schedule note"');
    });
  });

  it("keys shift codes but prints no shift key for full shift names", () => {
    const { container, unmount } = renderPrintView();
    expect(container.textContent).toContain("Shift key");
    unmount();

    const named = render(
      <PrintScheduleView
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
        shiftDisplayMode="name"
        noteMarksForKey={() => [{ indicatorTypeId: 80, state: "published" }]}
        indicatorTypes={indicatorTypes}
      />,
    );
    expect(named.container.textContent).not.toContain("Shift key");
    expect(named.container.querySelector("[data-print-indicator-legend]")).not.toBeNull();
  });

  // A double shift whose second half is in another focus area.
  describe("shift pills", () => {
    function renderCrossFocusDouble() {
      return render(
        <PrintScheduleView
          weekStart={new Date(2024, 0, 7)}
          config={{ fontSize: 11, selectedFocusAreas: ["North"], spanWeeks: 1 }}
          employees={employees}
          allEmployees={employees}
          focusAreas={[
            ...focusAreas,
            { id: 2, orgId: "org-1", departmentId: 1, name: "South Memory Care", sortOrder: 2 },
          ]}
          assignments={[assignments[0], nightSouth]}
          shiftCategories={shiftCategories}
          jobs={[]}
          certifications={[]}
          orgRoles={[]}
          shiftForKey={() => "D/N"}
          assignmentIdsForKey={() => [1, 2]}
          getShiftStyle={(label) => (label === "N" ? nightSouth : assignments[0])}
          onClose={() => {}}
        />,
      );
    }

    it("rounds every pill with literal radii, since the print window has no app CSS", () => {
      const { container } = renderCrossFocusDouble();

      const pills = Array.from(container.querySelectorAll<HTMLElement>("[data-print-pill]"));
      expect(pills).toHaveLength(14);
      for (const pill of pills) {
        expect(pill.style.borderRadius).toBe(PRINT_PILL_RADIUS.multi);
        expect(pill.outerHTML).not.toContain("var(--");
      }
    });

    it("gives the other focus area's initials their own part of the pill, never over the label", () => {
      const { container } = renderCrossFocusDouble();

      const wing = container.querySelector<HTMLElement>("[data-print-pill-wing]");
      expect(wing?.textContent).toBe("SMC");
      expect(wing?.style.position).toBe("");
      expect(wing?.style.flex).toBe("0 0 auto");
      expect(wing?.parentElement?.style.display).toBe("flex");
      expect(wing?.nextElementSibling?.textContent).not.toBe("");
    });

    it("stacks the initials upright at the pill's side, as the grid does", () => {
      const single = render(
        <PrintScheduleView
          weekStart={new Date(2024, 0, 7)}
          config={{ fontSize: 11, selectedFocusAreas: ["North"], spanWeeks: 2 }}
          employees={employees}
          allEmployees={employees}
          focusAreas={[
            ...focusAreas,
            { id: 2, orgId: "org-1", departmentId: 1, name: "South Memory Care", sortOrder: 2 },
          ]}
          assignments={[assignments[0], nightSouth]}
          shiftCategories={shiftCategories}
          jobs={[]}
          certifications={[]}
          orgRoles={[]}
          shiftForKey={() => "N"}
          assignmentIdsForKey={() => [2]}
          getShiftStyle={() => nightSouth}
          onClose={() => {}}
        />,
      );
      const singleWing = single.container.querySelector<HTMLElement>("[data-print-pill-wing]");
      expect(singleWing?.getAttribute("data-print-pill-wing")).toBe("side");
      expect(singleWing?.style.writingMode).toBe("vertical-rl");
      single.unmount();

      const { container } = renderCrossFocusDouble();
      const doubleWing = container.querySelector<HTMLElement>("[data-print-pill-wing]");
      expect(doubleWing?.getAttribute("data-print-pill-wing")).toBe("side");
      expect(doubleWing?.style.writingMode).toBe("vertical-rl");
    });

    it("edges only a shift from another area, as the grid leaves filled pills unedged", () => {
      const { container } = renderCrossFocusDouble();
      const [own, guest] = Array.from(container.querySelectorAll<HTMLElement>("[data-print-pill]"));

      expect(own.style.borderTopColor).toBe("transparent");
      expect(guest.style.background).toBe("rgb(255, 255, 255)");
      expect(guest.style.borderTopColor).not.toBe("transparent");
    });

    it("never cuts printed text off with an ellipsis or a line clamp", () => {
      const { container } = renderCrossFocusDouble();

      expect(container.innerHTML).not.toMatch(/ellipsis|line-clamp/);
      expect(container.querySelectorAll("[data-print-fit]").length).toBeGreaterThan(0);
    });
  });

  describe("absence for the rest of the day", () => {
    const sick: AbsenceType = {
      id: 9,
      orgId: "org-1",
      label: "S",
      name: "Sick",
      color: "#FEE2E2",
      border: "#FCA5A5",
      text: "#991B1B",
      sortOrder: 2,
    };
    const evening: AssignmentDefinition = { ...assignments[0], id: 3, label: "E", name: "Evening" };
    const firstDay = formatDateKey(new Date(2024, 0, 7));
    const secondDay = formatDateKey(new Date(2024, 0, 8));

    // Small type on one week leaves room for two pills side by side.
    function renderMixed(layout: AbsencePillLayout | null = null, fontSize = 9) {
      return render(
        <PrintScheduleView
          restOfDayAbsenceLayoutForKey={() => layout}
          weekStart={new Date(2024, 0, 7)}
          config={{ fontSize, selectedFocusAreas: ["North"], spanWeeks: 1 }}
          employees={employees}
          allEmployees={employees}
          focusAreas={focusAreas}
          assignments={[assignments[0], evening]}
          shiftCategories={shiftCategories}
          jobs={[]}
          certifications={[]}
          orgRoles={[]}
          shiftForKey={(_, date) => {
            const key = formatDateKey(date);
            return key === firstDay ? "D" : key === secondDay ? "D/E" : null;
          }}
          assignmentIdsForKey={(_, date) => {
            const key = formatDateKey(date);
            return key === firstDay ? [1] : key === secondDay ? [1, 3] : [];
          }}
          restOfDayAbsenceTypeIdForKey={(_, date) =>
            [firstDay, secondDay].includes(formatDateKey(date)) ? sick.id : null
          }
          absenceTypeMap={new Map([[sick.id, sick]])}
          getCustomShiftTimes={(_, date) =>
            formatDateKey(date) === firstDay ? { start: "07:00", end: "11:00" } : null
          }
          getShiftStyle={(label) => (label === "E" ? evening : assignments[0])}
          onClose={() => {}}
        />,
      );
    }

    function cellPills(cell: Element) {
      return Array.from(cell.querySelectorAll<HTMLElement>("[data-print-pill]"));
    }

    it("prints the absence after the shifts, without a time", () => {
      const { container } = renderMixed();
      const cells = Array.from(container.querySelectorAll("td")).filter(
        (cell) => cellPills(cell).length > 0,
      );

      const [mixed, triple] = cells;
      expect(cellPills(mixed).map((pill) => pill.textContent)).toEqual([
        expect.stringContaining("D"),
        "S",
      ]);
      expect(cellPills(mixed)[0].textContent).toContain("7");
      expect(cellPills(mixed)[1].style.background).toContain("repeating-linear-gradient(135deg");
      // The absence starts where the shift ends, so the two touch, with one line between.
      expect(cellPills(mixed)[0].style.borderRightStyle).toBe("none");
      expect(cellPills(mixed)[1].style.borderLeftStyle).not.toBe("none");
      expect(cellPills(triple)).toHaveLength(3);
      expect(cellPills(triple)[2].textContent).toBe("S");
    });

    it("prints an arrived-late absence first, with the time it covers (item 50d)", () => {
      const { container } = renderMixed({
        first: true,
        joinsShift: true,
        shortTime: "3 - 7",
        time: "3:00 AM - 7:00 AM",
      });
      const [mixed] = Array.from(container.querySelectorAll("td")).filter(
        (cell) => cellPills(cell).length > 0,
      );

      const pills = cellPills(mixed);
      expect(pills[0].textContent).toBe("S3 - 7");
      expect(pills[1].textContent).toContain("D");
      expect(pills[0].style.borderRightStyle).toBe("none");
    });

    function cellLayouts(container: HTMLElement) {
      return Array.from(container.querySelectorAll<HTMLElement>("td > div")).filter(
        (cell) => cellPills(cell).length > 0,
      );
    }

    it("always stacks three items and keeps two side by side where the column has room", () => {
      const [two, three] = cellLayouts(renderMixed().container);

      expect(two.dataset.printCellLayout).toBeUndefined();
      expect(two.style.flexDirection).toBe("row");
      expect(three.dataset.printCellLayout).toBe("stacked");
      expect(three.style.flexDirection).toBe("column");
    });

    it("stacks two items where the grid would, on a column too narrow for both", () => {
      const [two] = cellLayouts(renderMixed(null, 11).container);

      expect(two.dataset.printCellLayout).toBe("stacked");
      // Stacked, the shift and the absence below it meet along one edge.
      expect(cellPills(two)[0].style.borderBottomStyle).toBe("none");
    });
  });

  it("leaves off a row with nothing scheduled in the printed range", () => {
    const idle = { ...employees[0], id: "emp-2", firstName: "Idle", lastName: "Person" };
    const offOnly = { ...employees[0], id: "emp-3", firstName: "Off", lastName: "Only" };
    const { container } = render(
      <PrintScheduleView
        weekStart={new Date(2024, 0, 7)}
        config={{ fontSize: 11, selectedFocusAreas: ["North"], spanWeeks: 1 }}
        employees={[employees[0], idle, offOnly]}
        allEmployees={[employees[0], idle, offOnly]}
        focusAreas={focusAreas}
        assignments={assignments}
        shiftCategories={shiftCategories}
        jobs={[]}
        certifications={[]}
        orgRoles={[]}
        shiftForKey={(empId) => (empId === "emp-1" ? "D" : empId === "emp-3" ? "OFF" : null)}
        assignmentIdsForKey={(empId) => (empId === "emp-1" ? [1] : [])}
        getShiftStyle={() => assignments[0]}
        onClose={() => {}}
      />,
    );

    expect(container.textContent).toContain("Alex Taylor");
    expect(container.textContent).not.toContain("Idle Person");
    expect(container.textContent).not.toContain("Off Only");
  });

  it("leaves an empty day blank, as the grid does, and marks a plain day off", () => {
    const firstDay = formatDateKey(new Date(2024, 0, 7));
    const secondDay = formatDateKey(new Date(2024, 0, 8));
    const { container } = render(
      <PrintScheduleView
        weekStart={new Date(2024, 0, 7)}
        config={{ fontSize: 11, selectedFocusAreas: ["North"], spanWeeks: 1 }}
        employees={employees}
        allEmployees={employees}
        focusAreas={focusAreas}
        assignments={assignments}
        shiftCategories={shiftCategories}
        jobs={[]}
        certifications={[]}
        orgRoles={[]}
        shiftForKey={(_, date) => {
          const key = formatDateKey(date);
          return key === firstDay ? "D" : key === secondDay ? "OFF" : null;
        }}
        assignmentIdsForKey={(_, date) => (formatDateKey(date) === firstDay ? [1] : [])}
        getShiftStyle={() => assignments[0]}
        onClose={() => {}}
      />,
    );

    const dayCells = Array.from(container.querySelectorAll("tbody tr:first-child td")).slice(1);
    expect(dayCells[1].textContent).toBe("OFF");
    expect(dayCells.slice(2).every((cell) => cell.textContent === "")).toBe(true);
  });

  it("marks a mentored shift with the grid's M and keys it", () => {
    const { container } = render(
      <PrintScheduleView
        weekStart={new Date(2024, 0, 7)}
        config={{ fontSize: 11, selectedFocusAreas: ["North"], spanWeeks: 1 }}
        employees={employees}
        allEmployees={employees}
        focusAreas={focusAreas}
        assignments={assignments}
        shiftCategories={shiftCategories}
        jobs={[]}
        certifications={[]}
        orgRoles={[]}
        shiftForKey={() => "D"}
        assignmentIdsForKey={() => [1]}
        segmentsForKey={(_, date) => [{ isMentored: date.getDay() === 1 }]}
        getShiftStyle={() => assignments[0]}
        onClose={() => {}}
      />,
    );

    expect(container.querySelectorAll("[data-print-mentored]")).toHaveLength(1);
    expect(container.querySelector("[data-print-mentored-key]")?.textContent).toContain(
      "Mentored assignment",
    );
  });

  it("totals each shift per day as the grid does, counting shifts every area shares", () => {
    const anywhere: AssignmentDefinition = {
      ...assignments[0],
      id: 5,
      label: "F",
      name: "Float",
      focusAreaId: null,
    };
    const { container } = render(
      <PrintScheduleView
        weekStart={new Date(2024, 0, 7)}
        config={{ fontSize: 11, selectedFocusAreas: ["North"], spanWeeks: 1 }}
        employees={employees}
        allEmployees={employees}
        focusAreas={focusAreas}
        assignments={[assignments[0], anywhere]}
        shiftCategories={shiftCategories}
        jobs={[]}
        certifications={[]}
        orgRoles={[]}
        shiftForKey={(_, date) => (date.getDay() === 0 ? "F" : "D")}
        assignmentIdsForKey={(_, date) => (date.getDay() === 0 ? [5] : [1])}
        getShiftStyle={(label) => (label === "F" ? anywhere : assignments[0])}
        onClose={() => {}}
      />,
    );

    const tally = container.querySelector("[data-print-tally-row]");
    expect(tally?.querySelector("td")?.textContent).toBe("Day");
    expect(
      Array.from(tally?.querySelectorAll("[data-print-tally-count]") ?? []).map(
        (cell) => cell.textContent,
      ),
    ).toEqual(["1", "1", "1", "1", "1", "1", "1"]);
  });

  it("keys the absences the printout shows, in code mode only", () => {
    const { container, unmount } = renderPrintView();
    expect(container.querySelector("[data-print-absence-key]")?.textContent).toContain(
      "Vacation or Flex",
    );
    unmount();

    const named = render(
      <PrintScheduleView
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
        shiftDisplayMode="name"
      />,
    );
    expect(named.container.querySelector("[data-print-absence-key]")).toBeNull();
  });

  it("states the time the schedule was printed as well as the date", () => {
    const { container } = renderPrintView();

    expect(container.querySelector("[data-printed-at]")?.textContent).toMatch(/\d{1,2}:\d{2}/);
  });
});

describe("print document", () => {
  it("carries the app's font faces into the print window", () => {
    // jsdom drops a font face's src, so the sheets are stubbed as a browser reports them.
    const source = {
      styleSheets: [
        {
          cssRules: [
            { cssText: "@font-face { font-family: Inter; src: url(/fonts/inter.woff2); }" },
            { cssText: "body { color: red; }" },
          ],
        },
        {
          get cssRules(): never {
            throw new DOMException("cross-origin", "SecurityError");
          },
        },
      ],
    } as unknown as Document;

    const fontFaceCss = collectFontFaceCss(source);

    expect(fontFaceCss).toBe("@font-face { font-family: Inter; src: url(/fonts/inter.woff2); }");
  });

  it("escapes the title and keeps the schedule's own markup", () => {
    const html = buildPrintDocument({
      title: "Schedule: <1/7>",
      fontFaceCss: "@font-face { font-family: Inter; }",
      bodyHtml: '<div class="print-schedule-content">grid</div>',
    });

    expect(html).toContain("<title>Schedule: &lt;1/7&gt;</title>");
    expect(html).toContain("@font-face { font-family: Inter; }");
    expect(html).toContain('<div class="print-schedule-content">grid</div>');
  });
});

describe("gridEquivalentColumnWidth", () => {
  it("stacks two shifts on paper where a grid that narrow would stack them", () => {
    // Medium over two weeks leaves each day far too narrow for two pills.
    expect(stacksShifts(gridEquivalentColumnWidth(11, 14), 2, false)).toBe(true);
    // Small on one week leaves room for two codes side by side, not two names.
    expect(stacksShifts(gridEquivalentColumnWidth(9, 7), 2, false)).toBe(false);
    expect(stacksShifts(gridEquivalentColumnWidth(9, 7), 2, true)).toBe(true);
  });
});
