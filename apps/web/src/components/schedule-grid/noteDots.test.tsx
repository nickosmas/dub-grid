import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { IndicatorType } from "@/types";
import { NOTE_DOT_SIZE, NOTE_LANE_HEIGHT, noteMarksWidth } from "./badges";
import { NoteDots, NoteDotsLine, splitNoteMarks, type ScheduleNoteMark } from "./noteDots";

const indicatorTypes: IndicatorType[] = [
  { id: 1, orgId: "org-1", name: "Float", color: "#ff0000", sortOrder: 1 },
];

describe("NoteDots placement", () => {
  it("lays a pill's dots in a right-aligned strip by default, in the pill's flow", () => {
    const { container } = render(
      <NoteDots
        marks={[{ indicatorTypeId: 1, state: "published" }]}
        indicatorTypes={indicatorTypes}
        style={{ paddingRight: 3 }}
      />,
    );
    const dots = container.querySelector<HTMLElement>("[data-note-dots]")!;
    expect(dots.dataset.noteDots).toBe("lane");
    expect(dots.style.position).toBe("");
    expect(dots.style.height).toBe(`${NOTE_LANE_HEIGHT}px`);
    expect(dots.style.alignSelf).toBe("stretch");
    expect(dots.style.justifyContent).toBe("flex-end");
    expect(dots.style.paddingRight).toBe("3px");
    expect(container.querySelector("[data-note-mark=published]")).not.toBeNull();
    expect(container.querySelector("[data-note-icon]")).toBeNull();
  });

  it("ends a line of text with the dots, taking no strip", () => {
    const { container } = render(
      <NoteDots
        marks={[{ indicatorTypeId: 1, state: "published" }]}
        indicatorTypes={indicatorTypes}
        placement="line"
      />,
    );
    const dots = container.querySelector<HTMLElement>("[data-note-dots]")!;
    expect(dots.dataset.noteDots).toBe("line");
    expect(dots.style.position).toBe("");
    expect(dots.style.height).toBe("");
    expect(dots.style.flexShrink).toBe("0");
  });

  it("leaves a line unchanged when it has no dots to end it", () => {
    const { container } = render(
      <NoteDotsLine dots={null}>
        <span>8a–4p</span>
      </NoteDotsLine>,
    );
    expect(container.innerHTML).toBe("<span>8a–4p</span>");
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

describe("splitNoteMarks", () => {
  const mark = (indicatorTypeId: number): ScheduleNoteMark => ({
    indicatorTypeId,
    state: "published",
  });

  it("shows every note up to two", () => {
    expect(splitNoteMarks([])).toEqual({ shown: [], hidden: 0 });
    expect(splitNoteMarks([mark(1), mark(2)])).toEqual({ shown: [mark(1), mark(2)], hidden: 0 });
  });

  it("keeps the first two and counts the rest", () => {
    const marks = [1, 2, 3, 4, 5].map(mark);
    expect(splitNoteMarks(marks)).toEqual({ shown: [mark(1), mark(2)], hidden: 3 });
  });
});

describe("NoteDots corner dots", () => {
  const types: IndicatorType[] = [
    { id: 1, orgId: "org-1", name: "Readings", color: "#ff2600", sortOrder: 1 },
    { id: 2, orgId: "org-1", name: "Shower", color: "#2563eb", sortOrder: 2 },
    { id: 3, orgId: "org-1", name: "Float", color: "#1d9e75", sortOrder: 3 },
    { id: 4, orgId: "org-1", name: "Charge", color: "#7c3aed", sortOrder: 4 },
    { id: 5, orgId: "org-1", name: "Overtime", color: "#ea580c", sortOrder: 5 },
  ];
  const published = (count: number): ScheduleNoteMark[] =>
    types.slice(0, count).map((type) => ({ indicatorTypeId: type.id, state: "published" }));
  const dots = (container: HTMLElement) => [
    ...container.querySelectorAll<HTMLElement>("[data-note-mark]"),
  ];

  it("fills a published note with its colour and rims it in the pill's text colour", () => {
    const { container, getByLabelText } = render(
      <NoteDots marks={published(1)} indicatorTypes={types} rimColor="#0e5c66" />,
    );
    const [dot] = dots(container);
    expect(getByLabelText("Readings")).toBeInTheDocument();
    expect(dots(container)).toHaveLength(1);
    expect(dot.dataset.noteMark).toBe("published");
    expect(dot).toHaveStyle({ background: "#ff2600" });
    expect(dot.style.boxShadow).toBe("inset 0 0 0 1px #0e5c66");
  });

  it("draws two notes as two dots and no count", () => {
    const { container, getByLabelText } = render(
      <NoteDots marks={published(2)} indicatorTypes={types} />,
    );
    expect(dots(container)).toHaveLength(2);
    expect(container.querySelector("[data-note-more]")).toBeNull();
    expect(getByLabelText("2 notes: Readings, Shower")).toBeInTheDocument();
  });

  it("draws two dots and counts the rest, while naming every note", () => {
    const { container, getByLabelText } = render(
      <NoteDots marks={published(5)} indicatorTypes={types} rimColor="#0e5c66" />,
    );
    const more = container.querySelector<HTMLElement>("[data-note-more]")!;
    expect(dots(container)).toHaveLength(2);
    expect(more.dataset.noteMore).toBe("3");
    expect(more.textContent).toBe("+3");
    expect(more).toHaveStyle({ color: "#0e5c66" });
    expect(
      getByLabelText("5 notes: Readings, Shower, Float, Charge, Overtime"),
    ).toBeInTheDocument();
  });

  it("lets the count take the second dot's place on a narrow pill", () => {
    const three = render(<NoteDots marks={published(3)} indicatorTypes={types} narrow />);
    expect(dots(three.container)).toHaveLength(1);
    expect(three.container.querySelector("[data-note-more]")?.textContent).toBe("+2");
    expect(three.getByLabelText("3 notes: Readings, Shower, Float")).toBeInTheDocument();
    three.unmount();

    const two = render(<NoteDots marks={published(2)} indicatorTypes={types} narrow />);
    expect(dots(two.container)).toHaveLength(2);
    expect(two.container.querySelector("[data-note-more]")).toBeNull();
  });

  it("draws every state at the same size, its ring inside the dot", () => {
    const { container } = render(
      <NoteDots
        marks={[
          { indicatorTypeId: 1, state: "published" },
          { indicatorTypeId: 2, state: "draft_added" },
        ]}
        indicatorTypes={types}
      />,
    );
    const added = render(
      <NoteDots
        marks={[{ indicatorTypeId: 3, state: "published_added" }]}
        indicatorTypes={types}
      />,
    );
    const all = [...dots(container), ...dots(added.container)];
    expect(all.map((dot) => dot.dataset.noteMark)).toEqual([
      "published",
      "draft_added",
      "published_added",
    ]);
    for (const dot of all) {
      expect(dot.style.width).toBe(`${NOTE_DOT_SIZE}px`);
      expect(dot.style.height).toBe(`${NOTE_DOT_SIZE}px`);
      expect(dot.style.boxShadow).toMatch(/^inset /);
    }
  });

  it("draws a draft hollow in its colour, lightened on a dark pill", () => {
    const draft: ScheduleNoteMark[] = [{ indicatorTypeId: 1, state: "draft_added" }];
    const light = render(<NoteDots marks={draft} indicatorTypes={types} rimColor="#000" />);
    const [lightDot] = dots(light.container);
    expect(lightDot.style.background).toBe("transparent");
    expect(lightDot.style.boxShadow).toBe("inset 0 0 0 1.75px #ff2600");
    expect(light.getByLabelText("Readings · Added, not published")).toBeInTheDocument();
    light.unmount();

    const dark = render(<NoteDots marks={draft} indicatorTypes={types} isDark />);
    expect(dots(dark.container)[0].style.boxShadow).toBe("inset 0 0 0 1.75px #ff7d66");
  });

  it("rings a note the last publish added in the publish green", () => {
    const { container, getByLabelText } = render(
      <NoteDots
        marks={[{ indicatorTypeId: 1, state: "published_added" }]}
        indicatorTypes={types}
      />,
    );
    const [dot] = dots(container);
    expect(dot).toHaveStyle({ background: "#ff2600" });
    expect(dot.style.boxShadow).toBe("inset 0 0 0 1.75px rgba(22, 163, 74, 0.94)");
    expect(getByLabelText("Readings · Added in the last publish")).toBeInTheDocument();
  });

  it("lists every note inline", () => {
    const { container } = render(
      <NoteDots marks={published(3)} indicatorTypes={types} placement="inline" />,
    );
    expect(container.querySelectorAll("[data-note-icon]")).toHaveLength(3);
    expect(container.querySelector("[data-note-more]")).toBeNull();
  });
});

describe("noteMarksWidth", () => {
  it("claims a dot per note up to two, and a dot's room for the count", () => {
    expect(noteMarksWidth(0)).toBe(0);
    expect(noteMarksWidth(1)).toBe(9);
    expect(noteMarksWidth(2)).toBe(21);
    expect(noteMarksWidth(5)).toBe(33);
  });
});
