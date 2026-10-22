import { absenceStripeCss, resolveAbsenceStripes } from "@dubgrid/design-tokens";

/** An absence's fill: its own color in diagonal stripes, so it never reads as a worked shift. */
export interface AbsenceStripeFill {
  background: string;
  text: string;
  border: string;
  stripeA: string;
  stripeB: string;
}

export function absenceStripeFill(color: string, isDark: boolean): AbsenceStripeFill {
  const stripes = resolveAbsenceStripes(color, isDark);
  return { ...stripes, background: absenceStripeCss(stripes.stripeA, stripes.stripeB) };
}

/**
 * Stripes for an absence drawn in a fixed theme tint rather than its own
 * color (a deleted absence, or one whose type is not loaded): the tint plus a
 * step toward its ink, so the stripes stay visible on a near-white tint.
 */
export function tintStripeCss(tint: string, ink: string): string {
  return absenceStripeCss(`color-mix(in srgb, ${ink} 12%, ${tint})`, tint);
}
