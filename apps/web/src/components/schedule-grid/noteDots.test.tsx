import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { IndicatorType } from "@/types";
import { noteMarksWidth } from "./badges";
import { NoteDots } from "./noteDots";

const indicatorTypes: IndicatorType[] = [
  { id: 1, orgId: "org-1", name: "Float", color: "#ff0000", sortOrder: 1 },
];

describe("NoteDots placement", () => {
  it("pins a coloured mark in a corner by default, as the grid places it", () => {
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
    expect(container.querySelector("[data-note-mark=published]")).not.toBeNull();
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
    expect(container.querySelector("[data-note-mark]")).toBeNull();
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

describe("NoteDots corner mark", () => {
  const types: IndicatorType[] = [
    { id: 1, orgId: "org-1", name: "Readings", color: "#ff2600", sortOrder: 1 },
    { id: 2, orgId: "org-1", name: "Shower", color: "#2563eb", sortOrder: 2 },
    { id: 3, orgId: "org-1", name: "Float", color: "#1d9e75", sortOrder: 3 },
  ];
  const paths = (el: Element) =>
    [...el.querySelectorAll("path")].map((path) => [
      path.getAttribute("fill"),
      path.getAttribute("stroke"),
    ]);

  it("fills a published note with its colour and outlines it in the pill's text colour", () => {
    const { container, getByLabelText } = render(
      <NoteDots
        marks={[{ indicatorTypeId: 1, state: "published" }]}
        indicatorTypes={types}
        rimColor="#0e5c66"
      />,
    );
    expect(paths(getByLabelText("Readings"))[0]).toEqual(["#ff2600", "#0e5c66"]);
    expect(container.querySelectorAll("[data-note-mark]")).toHaveLength(1);
  });

  it("outlines a note the last publish added like any published note", () => {
    const { getByLabelText } = render(
      <NoteDots
        marks={[{ indicatorTypeId: 1, state: "published_added" }]}
        indicatorTypes={types}
        rimColor="#0e5c66"
      />,
    );
    expect(paths(getByLabelText("Readings · Added in the last publish"))[0]).toEqual([
      "#ff2600",
      "#0e5c66",
    ]);
  });

  it("draws a draft hollow in its colour, lightened on a dark pill", () => {
    const draft = [{ indicatorTypeId: 1, state: "draft_added" as const }];
    const light = render(<NoteDots marks={draft} indicatorTypes={types} rimColor="#000" />);
    expect(paths(light.getByLabelText("Readings · Added, not published"))[0]).toEqual([
      "none",
      "#ff2600",
    ]);
    light.unmount();

    const dark = render(<NoteDots marks={draft} indicatorTypes={types} isDark />);
    expect(paths(dark.getByLabelText("Readings · Added, not published"))[0]).toEqual([
      "none",
      "#ff7d66",
    ]);
  });

  it("stacks several notes into one mark that names them all", () => {
    const { container, getByLabelText } = render(
      <NoteDots
        marks={[
          { indicatorTypeId: 1, state: "published" },
          { indicatorTypeId: 2, state: "draft_added" },
          { indicatorTypeId: 3, state: "published" },
        ]}
        indicatorTypes={types}
      />,
    );
    const stack = getByLabelText("3 notes: Readings, Shower · Added, not published, Float");
    expect(stack.getAttribute("data-note-mark")).toBe("stack");
    expect(container.querySelectorAll("[data-note-mark]")).toHaveLength(1);
    expect(
      [...stack.querySelectorAll("[data-note-layer]")].map((layer) =>
        layer.getAttribute("data-note-layer"),
      ),
    ).toEqual(["draft_added", "published"]);
  });

  it("lists every note inline", () => {
    const { container } = render(
      <NoteDots
        marks={types.map((type) => ({ indicatorTypeId: type.id, state: "published" as const }))}
        indicatorTypes={types}
        placement="inline"
      />,
    );
    expect(container.querySelectorAll("[data-note-icon]")).toHaveLength(3);
  });
});

describe("noteMarksWidth", () => {
  it("claims one icon for a note and the stack for several", () => {
    expect(noteMarksWidth(0)).toBe(0);
    expect(noteMarksWidth(1)).toBe(11);
    expect(noteMarksWidth(2)).toBe(13);
    expect(noteMarksWidth(5)).toBe(13);
  });
});
