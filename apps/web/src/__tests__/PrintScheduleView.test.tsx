import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import PrintScheduleView from "@/components/PrintScheduleView";
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
}) {
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
      noteMarksForKey={indicators?.noteMarksForKey}
      indicatorTypes={indicators ? indicatorTypes : undefined}
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

  // 42a: the printout shows each cell's indicators and keys only those present.
  describe("indicators", () => {
    const firstDay = formatDateKey(new Date(2024, 0, 7));

    it("prints a cell's indicators and keys only the ones that appear", () => {
      const { container } = renderPrintView({
        noteMarksForKey: (_, date, focusAreaId) =>
          formatDateKey(date) === firstDay && focusAreaId === 1
            ? [{ indicatorTypeId: 80, state: "published" }]
            : [],
      });

      const dots = container.querySelectorAll("[data-print-indicators] span");
      expect(Array.from(dots).map((dot) => dot.getAttribute("aria-label"))).toEqual(["Float"]);
      const legend = container.querySelector<HTMLElement>("[data-print-indicator-legend]");
      expect(legend?.textContent).toContain("Float");
      expect(legend?.textContent).not.toContain("Training");
      expect(legend?.querySelector("[data-note-icon]")?.getAttribute("stroke")).toBe("#334766");
    });

    it("prints no indicator key when no indicator appears", () => {
      const { container } = renderPrintView({ noteMarksForKey: () => [] });

      expect(container.querySelector("[data-print-indicator-legend]")).toBeNull();
      expect(container.querySelector("[data-print-indicators]")).toBeNull();
    });

    it("uses literal colours, since the print window has no app CSS variables", () => {
      const { container } = renderPrintView({
        noteMarksForKey: () => [{ indicatorTypeId: 99, state: "published" }],
      });

      const markup = Array.from(container.querySelectorAll("[data-print-indicators]"))
        .map((element) => element.outerHTML)
        .join("");
      expect(markup).not.toContain("var(--");
      expect(markup).toContain('aria-label="Schedule note"');
    });
  });

  it("keys shift codes but prints no shift key for full shift names", () => {
    const { container, unmount } = renderPrintView();
    expect(container.textContent).toContain("Shift Key");
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
    expect(named.container.textContent).not.toContain("Shift Key");
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
        expect(pill.style.borderRadius).toBe("0.3em");
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

    it("sets a single shift's wing at its side and a double shift's on top", () => {
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
      expect(
        single.container
          .querySelector("[data-print-pill-wing]")
          ?.getAttribute("data-print-pill-wing"),
      ).toBe("side");
      single.unmount();

      const { container } = renderCrossFocusDouble();
      expect(
        container.querySelector("[data-print-pill-wing]")?.getAttribute("data-print-pill-wing"),
      ).toBe("top");
    });

    it("never cuts printed text off with an ellipsis or a line clamp", () => {
      const { container } = renderCrossFocusDouble();

      expect(container.innerHTML).not.toMatch(/ellipsis|line-clamp/);
      expect(container.querySelectorAll("[data-print-fit]").length).toBeGreaterThan(0);
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
