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

  it("draws lines to absolute points", () => {
    expect(svgPathToPdf("M0,0L5,5", flip)).toBe("0.00 100.00 m 5.00 95.00 l");
  });

  it("turns a quarter-turn arc into one cubic that hugs the circle", () => {
    expect(svgPathToPdf("M1,0A1,1 0 0 1 0,1", (x, y) => [x, y])).toBe(
      "1.00 0.00 m 1.00 0.55 0.55 1.00 0.00 1.00 c",
    );
  });

  it("splits an arc wider than a quarter turn into quarter-turn cubics", () => {
    // A 122° corner arc, as on the symbol's acute corners.
    const r = 10;
    const a = (122 * Math.PI) / 180;
    const d = `M${r},0A${r},${r} 0 0 1 ${(r * Math.cos(a)).toFixed(4)},${(r * Math.sin(a)).toFixed(4)}`;
    const ops = svgPathToPdf(d, (x, y) => [x, y]);
    expect(ops.match(/ c/g)).toHaveLength(2);
    const ends = [...ops.matchAll(/(-?\d+\.\d{2}) (-?\d+\.\d{2}) c/g)].map(([, x, y]) =>
      Math.hypot(Number(x), Number(y)),
    );
    for (const distance of ends) expect(distance).toBeCloseTo(r, 1);
  });

  it("refuses commands it cannot place", () => {
    expect(() => svgPathToPdf("M0,0Q5,5 10,0", flip)).toThrow("Unsupported SVG path command: Q");
  });
});

describe("pdfBrandMarkCommands", () => {
  it("fills each card after painting the gap around it in the background", () => {
    const [back, centerGap, center, frontGap, front] = pdfBrandMarkCommands(32, 580, 20);
    expect(back).toMatch(/^q 0\.561 0\.690 0\.973 rg .* h f Q$/);
    expect(centerGap).toMatch(/^q 1\.000 1\.000 1\.000 rg .* h f Q$/);
    expect(center).toMatch(/^q 0\.145 0\.388 0\.922 rg .* h f Q$/);
    expect(frontGap).toMatch(/^q 1\.000 1\.000 1\.000 rg .* h f Q$/);
    expect(front).toMatch(/^q 0\.561 0\.690 0\.973 rg .* h f Q$/);
  });

  it("puts the back card on the ink box's left edge, the front card on its right, and the center card on its top", () => {
    const points = (command: string) =>
      [...command.matchAll(/(-?\d+\.\d{2}) (-?\d+\.\d{2}) [mlc]/g)].map(([, x, y]) => [
        Number(x),
        Number(y),
      ]);
    const [back, , center, , front] = pdfBrandMarkCommands(100, 500, 138);
    expect(Math.min(...points(back).map(([x]) => x))).toBeCloseTo(100, 1);
    expect(Math.max(...points(front).map(([x]) => x))).toBeCloseTo(238, 1);
    expect(Math.max(...points(center).map(([, y]) => y))).toBeLessThanOrEqual(500);
    expect(Math.max(...points(front).map(([, y]) => y))).toBeLessThan(
      Math.max(...points(center).map(([, y]) => y)),
    );
  });
});
