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
  });
});
