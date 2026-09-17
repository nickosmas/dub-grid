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
 * The dashboard's wash, always a gradient of exactly two colours. The
 * sections are read in page order for the attention tones they carry: with
 * two distinct tones on the page (amber waiting, red broken) the wash runs
 * from the one that appears first to the other; with one tone it runs from
 * that colour to clear; with none there is no wash, so a healthy day is a
 * plain page. Two stops, never a run of them: a multi-stop wash read as a
 * rainbow even when every stop had a reason.
 *
 * "Clear" is the same RGB at zero alpha rather than `transparent`: iOS
 * interpolates gradients un-premultiplied and greys the run-out otherwise.
 */
export function buildStatusGradient(
  sections: readonly GradientStop[],
  toneHex: Record<Exclude<DashboardCardTone, "neutral">, string>,
  alpha: number,
): StatusGradient | null {
  const tones: Array<Exclude<DashboardCardTone, "neutral">> = [];
  for (const section of sections) {
    if (section.tone !== "neutral" && !tones.includes(section.tone)) tones.push(section.tone);
  }
  if (tones.length === 0) return null;

  const [first, second] = tones;
  const from = withAlpha(toneHex[first], alpha);
  const to = second ? withAlpha(toneHex[second], alpha) : withAlpha(toneHex[first], 0);

  return { colors: [from, to], locations: [0, 1] };
}
