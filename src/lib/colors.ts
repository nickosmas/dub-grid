export interface PredefinedColor {
  id: string;
  name: string;
  bg: string;
  text: string;
}

// Aesthetic light background / dark text pairs for Shift Codes and Focus Areas
export const PREDEFINED_COLORS: PredefinedColor[] = [
  { id: "slate", name: "Slate", bg: "#E2E8F0", text: "#1E293B" },
  { id: "red", name: "Red", bg: "#FECACA", text: "#991B1B" },
  { id: "orange", name: "Orange", bg: "#FED7AA", text: "#9A3412" },
  { id: "amber", name: "Amber", bg: "#FDE68A", text: "#92400E" },
  { id: "yellow", name: "Yellow", bg: "#FDE047", text: "#854D0E" },
  { id: "lime", name: "Lime", bg: "#D9F99D", text: "#3F6212" },
  { id: "green", name: "Green", bg: "#BBF7D0", text: "#166534" },
  { id: "emerald", name: "Emerald", bg: "#A7F3D0", text: "#065F46" },
  { id: "teal", name: "Teal", bg: "#99F6E4", text: "#115E59" },
  { id: "cyan", name: "Cyan", bg: "#A5F3FC", text: "#155E75" },
  { id: "sky", name: "Sky", bg: "#BAE6FD", text: "#075985" },
  { id: "blue", name: "Blue", bg: "#BFDBFE", text: "#1E40AF" },
  { id: "indigo", name: "Indigo", bg: "#C7D2FE", text: "#3730A3" },
  { id: "violet", name: "Violet", bg: "#DDD6FE", text: "#5B21B6" },
  { id: "purple", name: "Purple", bg: "#E9D5FF", text: "#6B21A8" },
  { id: "fuchsia", name: "Fuchsia", bg: "#F5D0FE", text: "#86198F" },
  { id: "pink", name: "Pink", bg: "#FBCFE8", text: "#9D174D" },
  { id: "rose", name: "Rose", bg: "#FECDD3", text: "#9F1239" },
];

/** Returns the text color as a semi-transparent rgba for use as a border. */
export function borderColor(textHex: string, opacity = 0.35): string {
  const r = parseInt(textHex.slice(1, 3), 16);
  const g = parseInt(textHex.slice(3, 5), 16);
  const b = parseInt(textHex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${opacity})`;
}

/** Find the closest preset color by background hex. Reverts to a default if not found. */
export function getPresetByBg(bgHex: string): PredefinedColor {
  const match = PREDEFINED_COLORS.find(c => c.bg.toLowerCase() === bgHex.toLowerCase());
  return match || PREDEFINED_COLORS[0]; // fallback to slate
}

/** Legacy mapping for off-days and default transparent assignments */
export const TRANSPARENT_BORDER = "transparent";

// ── Shared grid constants ────────────────────────────────────────────────────

/** Certification badge colors by abbreviation. */
export const DESIGNATION_COLORS: Record<string, { bg: string; text: string }> = {
  JLCSN: { bg: "#EDE9FE", text: "#6D28D9" },
  "CSN III": { bg: "#DBEAFE", text: "#1D4ED8" },
  "CSN II": { bg: "#CCFBF1", text: "#0E7490" },
  STAFF: { bg: "#F1F5F9", text: "#475569" },
};
export const DEFAULT_DESIG_COLOR = { bg: "#F1F5F9", text: "#475569" };

/** Draft-mode cell border colors by change kind. */
export const DRAFT_BORDER_COLORS: Record<string, string> = {
  new: '#2E9930',
  modified: '#D97706',
  deleted: '#DC2626',
};
