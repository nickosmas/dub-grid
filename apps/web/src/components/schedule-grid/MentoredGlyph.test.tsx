import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MentoredGlyph } from "./MentoredGlyph";

describe("MentoredGlyph", () => {
  it("draws its strokes centred in the box, so the M sits at its circle's centre", () => {
    const { container } = render(<MentoredGlyph size={10} />);
    const svg = container.querySelector("svg")!;
    const line = svg.querySelector("polyline")!;
    const half = Number(line.getAttribute("stroke-width")) / 2;
    const points = line
      .getAttribute("points")!
      .split(" ")
      .map((pair) => pair.split(",").map(Number));
    const xs = points.map(([x]) => x);
    const ys = points.map(([, y]) => y);
    const [, , boxWidth, boxHeight] = svg.getAttribute("viewBox")!.split(" ").map(Number);

    // Strokes reach half their width past each point; the round joins at the
    // top do the same, the butt ends at the bottom do not.
    const left = Math.min(...xs) - half;
    const right = Math.max(...xs) + half;
    const top = Math.min(...ys) - half;
    const bottom = Math.max(...ys);

    expect((left + right) / 2).toBeCloseTo(boxWidth / 2, 1);
    expect((top + bottom) / 2).toBeCloseTo(boxHeight / 2, 1);
  });

  it("takes the size it's given and hides from screen readers", () => {
    const { container } = render(<MentoredGlyph size="1.1em" />);
    const svg = container.querySelector("svg")!;
    expect(svg.getAttribute("width")).toBe("1.1em");
    expect(svg.getAttribute("aria-hidden")).toBe("true");
  });
});
