import type { CSSProperties } from "react";

/** An edge where a pill touches its neighbour in the cell. */
export type PillSeam = "top" | "right" | "bottom" | "left";

export type AttachedPillAxis = "stacked" | "side-by-side";

function toMinutes(time: string | null | undefined): number | null {
  const match = /^(\d{1,2}):(\d{2})/.exec(time?.trim() ?? "");
  if (!match) return null;
  return (Number(match[1]) * 60 + Number(match[2])) % (24 * 60);
}

/**
 * Whether a shift ending at `end` runs straight into one starting at `start`.
 * Pills only join when they meet: a double shift with a gap between its parts
 * stays two pills, so the cell never reads as one continuous block.
 */
export function timesMeet(end: string | null | undefined, start: string | null | undefined) {
  const endMinutes = toMinutes(end);
  return endMinutes != null && endMinutes === toMinutes(start);
}

/**
 * The seams of each pill in a cell, in order. `joins[i]` says whether pill `i`
 * touches pill `i + 1`.
 */
export function attachedPillSeams(axis: AttachedPillAxis, joins: boolean[]): PillSeam[][] {
  const [after, before]: [PillSeam, PillSeam] =
    axis === "stacked" ? ["bottom", "top"] : ["right", "left"];
  return Array.from({ length: joins.length + 1 }, (_, index) => [
    ...(index > 0 && joins[index - 1] ? [before] : []),
    ...(joins[index] ? [after] : []),
  ]);
}

/**
 * Per-side borders on an attached pill, so a seam can drop its border. An
 * unattached pill keeps the plain shorthand.
 */
export function seamBorders(
  border: string,
  seams: readonly PillSeam[],
): Pick<CSSProperties, "border" | "borderTop" | "borderRight" | "borderBottom" | "borderLeft"> {
  if (seams.length === 0) return { border };
  const side = (edge: PillSeam) => (seams.includes(edge) ? "none" : border);
  return {
    borderTop: side("top"),
    borderRight: side("right"),
    borderBottom: side("bottom"),
    borderLeft: side("left"),
  };
}

/** Corner radii with every corner on a seam squared off. */
export function seamRadius(radius: number | string, seams: readonly PillSeam[]): string {
  const r = typeof radius === "number" ? `${radius}px` : radius;
  if (seams.length === 0) return r;
  const corner = (a: PillSeam, b: PillSeam) => (seams.includes(a) || seams.includes(b) ? "0" : r);
  return [
    corner("top", "left"),
    corner("top", "right"),
    corner("bottom", "right"),
    corner("bottom", "left"),
  ].join(" ");
}

/**
 * Space before a pill that does not touch the one before it. The cell's
 * layout has no gap of its own, so joined pills meet without negative
 * margins, which would let a tall stack overflow the cell's padding.
 */
export function gapBefore(
  index: number,
  seams: readonly PillSeam[],
  axis: AttachedPillAxis,
  gap: number | string,
): CSSProperties {
  if (index === 0 || seams.includes("top") || seams.includes("left")) return {};
  return axis === "stacked" ? { marginTop: gap } : { marginLeft: gap };
}
