import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import PrintLegend from "@/components/PrintLegend";

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
