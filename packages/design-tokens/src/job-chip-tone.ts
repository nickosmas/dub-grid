import { resolveShiftPillColors } from "./pill-colors";

export type JobChipTone = {
  backgroundColor: string;
  borderColor: string;
  textColor: string;
};

/**
 * The theme-aware colors a job/role chip falls back to when the label matches
 * no known keyword, plus the warning ramp used for mentor/trainer labels.
 * Passed in rather than imported so this stays usable from either app's
 * already-resolved token set.
 */
export type JobChipToneContext = {
  surfaceSecondary: string;
  border: string;
  textMuted: string;
  warningSoft: string;
  warningBorder: string;
  warningText: string;
};

const SUPERVISOR_KEYWORDS = ["supervisor", "lead", "manager"];
const MENTOR_KEYWORDS = ["mentor", "trainer"];
const NURSE_KEYWORDS = ["nurse", "rn", "lpn"];

// Fixed brand-ish hues with no token equivalent. These are tuned for a light
// surface, so they go through `resolveShiftPillColors` in dark mode — unlike
// the warning ramp below, which is already theme-correct and must NOT be
// darkened a second time.
const SUPERVISOR_LIGHT: JobChipTone = {
  backgroundColor: "#FCE7F3",
  borderColor: "#FBCFE8",
  textColor: "#BE185D",
};

const NURSE_LIGHT: JobChipTone = {
  backgroundColor: "#ECFEFF",
  borderColor: "#A5F3FC",
  textColor: "#0E7490",
};

function darken(tone: JobChipTone, isDark: boolean): JobChipTone {
  if (!isDark) return tone;

  const resolved = resolveShiftPillColors(
    { color: tone.backgroundColor, text: tone.textColor, border: tone.borderColor },
    true,
  );

  return {
    backgroundColor: resolved.color,
    borderColor: resolved.border,
    textColor: resolved.text,
  };
}

function matches(label: string, keywords: readonly string[]): boolean {
  return keywords.some((keyword) => label.includes(keyword));
}

/**
 * Tone for a job/role chip derived from its label text.
 *
 * Shared because the schedule and requests screens both render these chips and
 * had drifted: the mentor branch rendered differently on each in dark mode.
 */
export function resolveJobChipTone(
  label: string,
  isDark: boolean,
  context: JobChipToneContext,
): JobChipTone {
  const normalized = label.trim().toLowerCase();

  if (matches(normalized, SUPERVISOR_KEYWORDS)) {
    return darken(SUPERVISOR_LIGHT, isDark);
  }

  if (matches(normalized, MENTOR_KEYWORDS)) {
    return {
      backgroundColor: context.warningSoft,
      borderColor: context.warningBorder,
      textColor: context.warningText,
    };
  }

  if (matches(normalized, NURSE_KEYWORDS)) {
    return darken(NURSE_LIGHT, isDark);
  }

  return {
    backgroundColor: context.surfaceSecondary,
    borderColor: context.border,
    textColor: context.textMuted,
  };
}
