import {
  BRAND_MARK_BACK,
  BRAND_MARK_BACK_STROKE,
  BRAND_MARK_FRONT,
  BRAND_MARK_GAP,
  BRAND_MARK_INK,
  brandMarkCardPath,
} from "@dubgrid/design-tokens";

type Rgb = readonly [number, number, number];

const rgb = (color: Rgb) => color.map((channel) => channel.toFixed(3)).join(" ");

/**
 * Converts an absolute SVG path of M, H, V, C and Z commands into PDF path
 * operators. `map` places an SVG point on the page, which also flips y,
 * since PDF y grows upward.
 */
export function svgPathToPdf(d: string, map: (x: number, y: number) => [number, number]): string {
  const tokens = d.match(/[A-Za-z]|-?\d*\.?\d+/g) ?? [];
  const ops: string[] = [];
  const point = (x: number, y: number) =>
    map(x, y)
      .map((n) => n.toFixed(2))
      .join(" ");
  let cx = 0;
  let cy = 0;
  let i = 0;
  const num = () => Number(tokens[i++]);
  while (i < tokens.length) {
    const command = tokens[i++];
    if (command === "M") {
      cx = num();
      cy = num();
      ops.push(`${point(cx, cy)} m`);
    } else if (command === "H") {
      cx = num();
      ops.push(`${point(cx, cy)} l`);
    } else if (command === "V") {
      cy = num();
      ops.push(`${point(cx, cy)} l`);
    } else if (command === "C") {
      const [x1, y1, x2, y2] = [num(), num(), num(), num()];
      cx = num();
      cy = num();
      ops.push(`${point(x1, y1)} ${point(x2, y2)} ${point(cx, cy)} c`);
    } else if (command === "Z") {
      ops.push("h");
    } else {
      throw new Error(`Unsupported SVG path command: ${command}`);
    }
  }
  return ops.join(" ");
}

/**
 * The two-card symbol in one color, its ink `width` wide with the ink's top
 * left corner at (`x`, `top`). The gap is painted in `background`.
 */
export function pdfBrandMarkCommands(
  x: number,
  top: number,
  width: number,
  color: Rgb,
  background: Rgb = [1, 1, 1],
): string[] {
  const scale = width / BRAND_MARK_INK.width;
  const map = (px: number, py: number): [number, number] => [
    x + (px - BRAND_MARK_INK.x) * scale,
    top - (py - BRAND_MARK_INK.y) * scale,
  ];
  const back = svgPathToPdf(brandMarkCardPath(BRAND_MARK_BACK), map);
  const front = svgPathToPdf(brandMarkCardPath(BRAND_MARK_FRONT), map);
  return [
    `q ${rgb(color)} RG ${(BRAND_MARK_BACK_STROKE * scale).toFixed(2)} w ${back} S Q`,
    `q ${rgb(background)} rg ${rgb(background)} RG ${(BRAND_MARK_GAP * 2 * scale).toFixed(2)} w 1 j ${front} B Q`,
    `q ${rgb(color)} rg ${front} f Q`,
  ];
}
