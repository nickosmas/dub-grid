import { describe, expect, it } from "vitest";

import {
  fitGridText,
  GRID_FIT_ATTR,
  GRID_FIT_FLOOR_ATTR,
  GRID_FIT_MIN_SCALE,
  gridFitLine,
  gridFitSize,
} from "./gridFit";

const scaleOf = (line: HTMLElement) =>
  Number(line.style.getPropertyValue("--dg-grid-fit-scale") || 1);

// jsdom has no layout, so each line reports a width from its current scale.
function fitLine(
  room: number,
  naturalAt: (scale: number) => number,
  log?: string[],
  name = "line",
): HTMLElement {
  const line = document.createElement("span");
  line.setAttribute(GRID_FIT_ATTR, "");
  Object.defineProperty(line, "clientWidth", {
    get: () => {
      log?.push(`read ${name}`);
      return room;
    },
  });
  Object.defineProperty(line, "scrollWidth", {
    get: () => Math.max(room, naturalAt(scaleOf(line))),
  });
  const setProperty = line.style.setProperty.bind(line.style);
  line.style.setProperty = (property: string, value: string | null, priority?: string) => {
    log?.push(`write ${name}`);
    setProperty(property, value, priority);
  };
  return line;
}

function rootWith(...lines: HTMLElement[]): HTMLElement {
  const root = document.createElement("div");
  root.append(...lines);
  return root;
}

describe("fitGridText", () => {
  it("leaves a line that fits at full size", () => {
    const line = fitLine(60, (scale) => 50 * scale);

    const result = fitGridText(rootWith(line));

    expect(line.style.getPropertyValue("--dg-grid-fit-scale")).toBe("");
    expect(line.style.textOverflow).toBe("");
    expect(result).toEqual({ smallestScale: 1, atFloor: 0 });
  });

  it("shrinks an over-wide line by the ratio of room to width", () => {
    const line = fitLine(80, (scale) => 100 * scale);

    const result = fitGridText(rootWith(line));

    expect(scaleOf(line)).toBeCloseTo(0.8);
    expect(line.style.textOverflow).toBe("");
    expect(result.smallestScale).toBeCloseTo(0.8);
  });

  it("holds a line at the floor and ellipsizes only then", () => {
    const line = fitLine(100, (scale) => 300 * scale);

    const result = fitGridText(rootWith(line));

    expect(scaleOf(line)).toBe(GRID_FIT_MIN_SCALE);
    expect(line.style.textOverflow).toBe("ellipsis");
    expect(line.hasAttribute(GRID_FIT_FLOOR_ATTR)).toBe(true);
    expect(result).toEqual({ smallestScale: GRID_FIT_MIN_SCALE, atFloor: 1 });
  });

  it("takes a second pass when a line still overflows after shrinking", () => {
    // Shrinking is not exactly proportional: at 0.8 the line measures 90, not 80.
    const line = fitLine(80, (scale) => (scale === 1 ? 100 : scale > 0.79 ? 90 : 80));

    fitGridText(rootWith(line));

    expect(scaleOf(line)).toBeCloseTo((0.8 * 80) / 90);
    expect(line.style.textOverflow).toBe("");
  });

  it("reads every width in a pass before writing any scale", () => {
    const log: string[] = [];
    const a = fitLine(80, (scale) => 100 * scale, log, "a");
    const b = fitLine(50, (scale) => 100 * scale, log, "b");

    fitGridText(rootWith(a, b));

    const firstWrite = log.findIndex((entry) => entry.startsWith("write"));
    expect(log.slice(0, firstWrite)).toEqual(["read a", "read b"]);
  });

  it("clears an earlier fit before measuring again", () => {
    let natural = 100;
    const line = fitLine(80, (scale) => natural * scale);
    const root = rootWith(line);
    fitGridText(root);
    expect(scaleOf(line)).toBeCloseTo(0.8);

    natural = 70;
    fitGridText(root);

    expect(line.style.getPropertyValue("--dg-grid-fit-scale")).toBe("");
  });
});

describe("gridFitLine", () => {
  it("is one full-width line sized from its token and the fit scale", () => {
    expect(gridFitLine("var(--dg-fs-title)")).toMatchObject({
      display: "block",
      width: "100%",
      whiteSpace: "nowrap",
      overflow: "hidden",
      fontSize: "calc(var(--dg-fs-title) * var(--dg-grid-fit-scale, 1))",
    });
  });

  it("wraps between words when asked, never inside one", () => {
    expect(gridFitLine("var(--dg-fs-caption)", { wrap: true })).toMatchObject({
      whiteSpace: "normal",
      overflowWrap: "normal",
    });
  });

  it("sizes text inside a line from its own token at the line's scale", () => {
    expect(gridFitSize("var(--dg-fs-footnote)")).toBe(
      "calc(var(--dg-fs-footnote) * var(--dg-grid-fit-scale, 1))",
    );
  });
});
