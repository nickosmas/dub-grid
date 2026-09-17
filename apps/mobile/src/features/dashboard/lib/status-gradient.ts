import type { DashboardCardTone } from "../components/DashboardCard";

export type GradientStop = {
  key: string;
  tone: DashboardCardTone;
};

export type StatusGradient = {
  colors: string[];
  locations: number[];
};

function withAlpha(hex: string, alpha: number): string {
  const value = hex.replace("#", "");
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * One vertical wash for the whole dashboard page, top edge to bottom edge,
 * whose colour follows the sections in the order they appear: one stop per
 * section, evenly spaced, in that section's tone, with neutral sections
 * fading the wash to clear. Adjacent attention sections blend into each
 * other, so the page reads top to bottom as one state story.
 *
 * Neutral stops take the RGB of the nearest coloured neighbour at zero
 * alpha rather than `transparent`: iOS interpolates gradients un-premultiplied
 * and greys the run-out otherwise. Returns null when nothing needs a hand,
 * so a healthy day is a plain page.
 */
export function buildStatusGradient(
  sections: readonly GradientStop[],
  toneHex: Record<Exclude<DashboardCardTone, "neutral">, string>,
  alpha: number,
): StatusGradient | null {
  if (sections.length === 0 || !sections.some((s) => s.tone !== "neutral")) return null;

  const nearestHex = (index: number): string => {
    for (let distance = 1; distance < sections.length; distance += 1) {
      const before = sections[index - distance];
      if (before && before.tone !== "neutral") return toneHex[before.tone];
      const after = sections[index + distance];
      if (after && after.tone !== "neutral") return toneHex[after.tone];
    }
    return toneHex.warning;
  };

  // A single section still needs two stops to be a gradient at all.
  const stops = sections.length === 1 ? [sections[0], sections[0]] : [...sections];
  const colors = stops.map((section, index) =>
    section.tone === "neutral"
      ? withAlpha(nearestHex(index), 0)
      : withAlpha(toneHex[section.tone], alpha),
  );
  const locations = stops.map((_, index) => index / (stops.length - 1));

  return { colors, locations };
}
