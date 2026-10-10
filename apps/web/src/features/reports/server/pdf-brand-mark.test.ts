import { describe, expect, it } from "vitest";
import { pdfBrandMarkCommands, svgPathToPdf } from "./pdf-brand-mark";

const flip = (x: number, y: number): [number, number] => [x, 100 - y];

describe("svgPathToPdf", () => {
  it("turns absolute moves, lines, curves and closes into PDF operators", () => {
    expect(svgPathToPdf("M10,0H90C95,0 100,5 100,10V20Z", flip)).toBe(
      "10.00 100.00 m 90.00 100.00 l 95.00 100.00 100.00 95.00 100.00 90.00 c 100.00 80.00 l h",
    );
  });

  it("keeps the other axis when drawing a horizontal or vertical line", () => {
    expect(svgPathToPdf("M1,2V7H4", (x, y) => [x, y])).toBe("1.00 2.00 m 1.00 7.00 l 4.00 7.00 l");
  });

  it("refuses commands it cannot place", () => {
    expect(() => svgPathToPdf("M0,0L5,5", flip)).toThrow("Unsupported SVG path command: L");
  });
});

describe("pdfBrandMarkCommands", () => {
  it("strokes the back card, cuts the gap in the background, then fills the front card", () => {
    const [back, gap, front] = pdfBrandMarkCommands(32, 580, 97 / 4, [0, 0, 1]);
    expect(back).toMatch(/^q 0\.000 0\.000 1\.000 RG 1\.50 w .* h S Q$/);
    expect(gap).toMatch(/^q 1\.000 1\.000 1\.000 rg 1\.000 1\.000 1\.000 RG 3\.00 w 1 j .* h B Q$/);
    expect(front).toMatch(/^q 0\.000 0\.000 1\.000 rg .* h f Q$/);
  });

  it("puts the back card's outline on the ink box's left edge and the front card on its right", () => {
    const points = (command: string) =>
      [...command.matchAll(/(-?\d+\.\d{2}) (-?\d+\.\d{2}) [mlc]/g)].map(([, x, y]) => [
        Number(x),
        Number(y),
      ]);
    const [back, , front] = pdfBrandMarkCommands(100, 500, 97, [0, 0, 0]);
    const backXs = points(back).map(([x]) => x);
    const frontXs = points(front).map(([x]) => x);
    const frontYs = points(front).map(([, y]) => y);
    // The back card's path runs along the middle of its 6-unit stroke.
    expect(Math.min(...backXs)).toBeCloseTo(103, 1);
    expect(Math.max(...frontXs)).toBeCloseTo(197, 1);
    expect(Math.max(...frontYs)).toBeLessThanOrEqual(500);
  });
});
