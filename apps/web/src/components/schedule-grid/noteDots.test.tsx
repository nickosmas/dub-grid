import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { IndicatorType } from "@/types";
import { NoteDots } from "./noteDots";

const indicatorTypes: IndicatorType[] = [
  { id: 1, orgId: "org-1", name: "Float", color: "#ff0000", sortOrder: 1 },
];

describe("NoteDots placement", () => {
  it("pins the dots in a corner by default, as the grid places them", () => {
    const { container } = render(
      <NoteDots
        marks={[{ indicatorTypeId: 1, state: "published" }]}
        indicatorTypes={indicatorTypes}
        style={{ top: 1, right: 1 }}
      />,
    );
    const dots = container.querySelector<HTMLElement>("[data-note-dots]")!;
    expect(dots.style.position).toBe("absolute");
    expect(dots.style.top).toBe("1px");
    // The grid has no room for an icon, so its cells keep dots.
    expect(container.querySelector("[data-note-dot]")).not.toBeNull();
    expect(container.querySelector("[data-note-icon]")).toBeNull();
  });

  it("lets inline dots flow with the row where nothing is positioned", () => {
    const { container, getByLabelText } = render(
      <NoteDots
        marks={[{ indicatorTypeId: 1, state: "published" }]}
        indicatorTypes={indicatorTypes}
        placement="inline"
      />,
    );
    const dots = container.querySelector<HTMLElement>("[data-note-dots]")!;
    expect(dots.style.position).toBe("");
    expect(dots.dataset.noteDots).toBe("inline");
    expect(getByLabelText("Float")).toBeInTheDocument();
    expect(container.querySelector("[data-note-dot]")).toBeNull();
    expect(container.querySelector("[data-note-icon]")).not.toBeNull();
  });

  it("draws inline icons in the text colour, a draft addition faded", () => {
    const { container } = render(
      <NoteDots
        marks={[{ indicatorTypeId: 1, state: "draft_added" }]}
        indicatorTypes={indicatorTypes}
        placement="inline"
      />,
    );
    const icon = container.querySelector<SVGElement>("[data-note-icon]")!;
    expect(icon.getAttribute("fill")).toBe("none");
    expect(icon.getAttribute("stroke")).toBe("currentColor");
    expect(icon.style.opacity).toBe("0.5");
    expect(container.innerHTML).not.toContain("#ff0000");
  });
});
