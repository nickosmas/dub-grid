import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import PrintLegend, { legendGroupsByFocusArea } from "@/components/PrintLegend";

describe("PrintLegend indicators", () => {
  it("keys the indicators beneath the shifts", () => {
    const { container } = render(
      <PrintLegend
        assignments={[]}
        indicators={[{ id: 80, orgId: "org-1", name: "Float", color: "#ff0000", sortOrder: 1 }]}
      />,
    );

    expect(container.querySelector("[data-print-legend-indicators]")?.textContent).toBe("Float");
    expect(
      container.querySelector("[data-print-legend-indicators] [data-note-icon]"),
    ).not.toBeNull();
  });

  it("shows no indicator key without indicators", () => {
    const { container } = render(<PrintLegend assignments={[]} />);

    expect(container.querySelector("[data-print-legend-indicators]")).toBeNull();
  });
});

describe("legendGroupsByFocusArea", () => {
  const areas = [
    { id: 1, name: "East Wing" },
    { id: 2, name: "West Wing" },
  ];

  it("lists each area's shifts under it, org-wide ones first without a heading", () => {
    const groups = legendGroupsByFocusArea(
      [
        { id: 10, focusAreaId: 2 },
        { id: 11, focusAreaId: null },
        { id: 12, focusAreaId: 1 },
        { id: 13, focusAreaId: 2 },
      ],
      areas,
    );

    expect(groups.map((group) => [group.title, group.items.map((item) => item.id)])).toEqual([
      [null, [11]],
      ["East Wing", [12]],
      ["West Wing", [10, 13]],
    ]);
  });

  it("prints a single group without a heading", () => {
    expect(legendGroupsByFocusArea([{ id: 10, focusAreaId: 1 }], areas)).toEqual([
      { title: null, items: [{ id: 10, focusAreaId: 1 }] },
    ]);
  });
});
