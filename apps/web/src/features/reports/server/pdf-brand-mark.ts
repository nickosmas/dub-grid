import {
  BRAND_SYMBOL_COLORS,
  BRAND_SYMBOL_INK,
  brandSymbolGap,
  getBrandSymbolPaths,
} from "@dubgrid/design-tokens";

type Rgb = readonly [number, number, number];
type Point = readonly [number, number];

const rgb = (color: Rgb) => color.map((channel) => channel.toFixed(3)).join(" ");
const hexToRgb = (hex: string): Rgb =>
  [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255) as unknown as Rgb;

/**
 * A circular SVG arc from `from` to `to` as cubic Béziers of at most a
 * quarter turn each, since PDF has no arc operator.
 */
function arcToCubics(
  from: Point,
  to: Point,
  radius: number,
  largeArc: boolean,
  sweep: boolean,
): [Point, Point, Point][] {
  const [dx, dy] = [to[0] - from[0], to[1] - from[1]];
  const chord = Math.hypot(dx, dy);
  const reach = Math.sqrt(Math.max(0, radius ** 2 - (chord / 2) ** 2));
  const side = largeArc === sweep ? -1 : 1;
  const center: Point = [
    (from[0] + to[0]) / 2 + (side * reach * -dy) / chord,
    (from[1] + to[1]) / 2 + (side * reach * dx) / chord,
  ];
  const start = Math.atan2(from[1] - center[1], from[0] - center[0]);
  let turn = Math.atan2(to[1] - center[1], to[0] - center[0]) - start;
  if (sweep && turn < 0) turn += 2 * Math.PI;
  if (!sweep && turn > 0) turn -= 2 * Math.PI;
  const segments = Math.max(1, Math.ceil(Math.abs(turn) / (Math.PI / 2) - 1e-9));
  const step = turn / segments;
  const k = (4 / 3) * Math.tan(step / 4) * radius;
  const at = (a: number): Point => [
    center[0] + radius * Math.cos(a),
    center[1] + radius * Math.sin(a),
  ];
  return Array.from({ length: segments }, (_, i) => {
    const a0 = start + i * step;
    const a1 = a0 + step;
    const p0 = at(a0);
    const p3 = at(a1);
    return [
      [p0[0] - k * Math.sin(a0), p0[1] + k * Math.cos(a0)],
      [p3[0] + k * Math.sin(a1), p3[1] - k * Math.cos(a1)],
      p3,
    ];
  });
}

/**
 * Converts an absolute SVG path of M, L, H, V, C, A and Z commands into PDF
 * path operators. `map` places an SVG point on the page, which also flips y,
 * since PDF y grows upward; it must be affine, so arcs map as their curves.
 */
export function svgPathToPdf(d: string, map: (x: number, y: number) => [number, number]): string {
  const tokens = d.match(/[A-Za-z]|-?\d*\.?\d+/g) ?? [];
  const ops: string[] = [];
  const point = (x: number, y: number) =>
    map(x, y)
      .map((n) => (Math.abs(n) < 0.005 ? 0 : n).toFixed(2))
      .join(" ");
  let cx = 0;
  let cy = 0;
  let i = 0;
  const num = () => Number(tokens[i++]);
  while (i < tokens.length) {
    const command = tokens[i++];
    if (command === "M" || command === "L") {
      cx = num();
      cy = num();
      ops.push(`${point(cx, cy)} ${command === "M" ? "m" : "l"}`);
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
    } else if (command === "A") {
      const [rx, , , largeArc, sweep] = [num(), num(), num(), num(), num()];
      const to: Point = [num(), num()];
      for (const [c1, c2, end] of arcToCubics([cx, cy], to, rx, largeArc === 1, sweep === 1)) {
        ops.push(`${point(...c1)} ${point(...c2)} ${point(...end)} c`);
      }
      [cx, cy] = to;
    } else if (command === "Z") {
      ops.push("h");
    } else {
      throw new Error(`Unsupported SVG path command: ${command}`);
    }
  }
  return ops.join(" ");
}

/**
 * The three-card symbol in its light colors, its ink `width` wide with the
 * ink's top left corner at (`x`, `top`). Each gap is painted in `background`
 * just before the card it surrounds.
 */
export function pdfBrandMarkCommands(
  x: number,
  top: number,
  width: number,
  background: Rgb = [1, 1, 1],
): string[] {
  const scale = width / BRAND_SYMBOL_INK.width;
  const map = (px: number, py: number): [number, number] => [x + px * scale, top - py * scale];
  const [back, ...ahead] = getBrandSymbolPaths(brandSymbolGap(BRAND_SYMBOL_INK.height * scale));
  const fill = (d: string, color: Rgb) => `q ${rgb(color)} rg ${svgPathToPdf(d, map)} f Q`;
  const colors = BRAND_SYMBOL_COLORS.light;
  return [
    fill(back.path, hexToRgb(colors[back.tone])),
    ...ahead.flatMap((card, k) => [
      fill(back.cut[k], background),
      fill(card.path, hexToRgb(colors[card.tone])),
    ]),
  ];
}
