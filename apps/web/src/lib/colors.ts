import type { ShiftRequestStatus } from "@/types";

export interface PredefinedColor {
  id: string;
  name: string;
  bg: string;
  text: string;
}

type ColorSeed = {
  id: string;
  name: string;
  bg: string;
};

type ColorGroup = {
  id: string;
  label: string;
  colors: ColorSeed[];
};

const PREDEFINED_COLOR_SECTIONS: ColorGroup[] = [
  {
    id: "standard",
    label: "Standard",
    colors: [
      { id: "slate", name: "Slate", bg: "#E2E8F0" },
      { id: "red", name: "Red", bg: "#FECACA" },
      { id: "orange", name: "Orange", bg: "#FED7AA" },
      { id: "amber", name: "Amber", bg: "#FDE68A" },
      { id: "yellow", name: "Yellow", bg: "#FDE047" },
      { id: "lime", name: "Lime", bg: "#D9F99D" },
      { id: "green", name: "Green", bg: "#BBF7D0" },
      { id: "emerald", name: "Emerald", bg: "#A7F3D0" },
      { id: "teal", name: "Teal", bg: "#99F6E4" },
      { id: "cyan", name: "Cyan", bg: "#A5F3FC" },
      { id: "sky", name: "Sky", bg: "#BAE6FD" },
      { id: "blue", name: "Blue", bg: "#BFDBFE" },
      { id: "indigo", name: "Indigo", bg: "#C7D2FE" },
      { id: "violet", name: "Violet", bg: "#DDD6FE" },
      { id: "purple", name: "Purple", bg: "#E9D5FF" },
      { id: "fuchsia", name: "Fuchsia", bg: "#F5D0FE" },
      { id: "pink", name: "Pink", bg: "#FBCFE8" },
      { id: "rose", name: "Rose", bg: "#FECDD3" },
      { id: "melon", name: "Melon", bg: "#FDBA74" },
      { id: "mint", name: "Mint", bg: "#86EFAC" },
    ],
  },
  {
    id: "soft",
    label: "Soft",
    colors: [
      { id: "sand", name: "Sand", bg: "#F5E7C8" },
      { id: "butter", name: "Butter", bg: "#FEF3C7" },
      { id: "sage", name: "Sage", bg: "#DCFCE7" },
      { id: "mist", name: "Mist", bg: "#E0F2FE" },
      { id: "powder", name: "Powder", bg: "#DBEAFE" },
      { id: "lilac", name: "Lilac", bg: "#EDE9FE" },
      { id: "petal", name: "Petal", bg: "#FCE7F3" },
      { id: "ice", name: "Ice", bg: "#ECFEFF" },
      { id: "cream", name: "Cream", bg: "#FEF7E0" },
      { id: "linen", name: "Linen", bg: "#F5EBDD" },
      { id: "oat", name: "Oat", bg: "#EEE6D8" },
      { id: "biscuit", name: "Biscuit", bg: "#F6DFC8" },
      { id: "meadow", name: "Meadow", bg: "#E7F8D8" },
      { id: "foam", name: "Foam", bg: "#D9FBE8" },
      { id: "cloud", name: "Cloud", bg: "#EFF6FF" },
      { id: "rain", name: "Rain", bg: "#E3F0FF" },
      { id: "periwinkle", name: "Periwinkle", bg: "#E0E7FF" },
      { id: "orchid", name: "Orchid", bg: "#F2E8FF" },
      { id: "blush", name: "Blush", bg: "#FDE2E8" },
      { id: "pearl", name: "Pearl", bg: "#F8F4EC" },
    ],
  },
];

function clampChannel(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function parseHex(hex: string | null | undefined): string | null {
  if (typeof hex !== "string") return null;
  const trimmed = hex.trim();
  if (/^#[0-9a-f]{6}$/i.test(trimmed)) return trimmed.toUpperCase();

  if (/^#[0-9a-f]{3}$/i.test(trimmed)) {
    const [, r, g, b] = trimmed;
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
  }

  return null;
}

function normalizeHex(hex: string): string {
  const parsed = parseHex(hex);
  if (parsed) return parsed;

  return "#E2E8F0";
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const normalized = normalizeHex(hex);
  return {
    r: Number.parseInt(normalized.slice(1, 3), 16),
    g: Number.parseInt(normalized.slice(3, 5), 16),
    b: Number.parseInt(normalized.slice(5, 7), 16),
  };
}

function rgbToHex(rgb: { r: number; g: number; b: number }): string {
  return `#${[rgb.r, rgb.g, rgb.b]
    .map((value) => clampChannel(value).toString(16).padStart(2, "0"))
    .join("")}`.toUpperCase();
}

function rgbToHsl(rgb: { r: number; g: number; b: number }): { h: number; s: number; l: number } {
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;

  if (max === min) {
    return { h: 0, s: 0, l };
  }

  const delta = max - min;
  const s = l > 0.5 ? delta / (2 - max - min) : delta / (max + min);
  let h = 0;

  switch (max) {
    case r:
      h = (g - b) / delta + (g < b ? 6 : 0);
      break;
    case g:
      h = (b - r) / delta + 2;
      break;
    default:
      h = (r - g) / delta + 4;
      break;
  }

  h /= 6;

  return { h: h * 360, s, l };
}

function hueToRgb(p: number, q: number, t: number): number {
  let nextT = t;
  if (nextT < 0) nextT += 1;
  if (nextT > 1) nextT -= 1;
  if (nextT < 1 / 6) return p + (q - p) * 6 * nextT;
  if (nextT < 1 / 2) return q;
  if (nextT < 2 / 3) return p + (q - p) * (2 / 3 - nextT) * 6;
  return p;
}

function hslToRgb(hsl: { h: number; s: number; l: number }): { r: number; g: number; b: number } {
  const h = (((hsl.h % 360) + 360) % 360) / 360;
  const s = Math.max(0, Math.min(1, hsl.s));
  const l = Math.max(0, Math.min(1, hsl.l));

  if (s === 0) {
    const value = clampChannel(l * 255);
    return { r: value, g: value, b: value };
  }

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;

  return {
    r: clampChannel(hueToRgb(p, q, h + 1 / 3) * 255),
    g: clampChannel(hueToRgb(p, q, h) * 255),
    b: clampChannel(hueToRgb(p, q, h - 1 / 3) * 255),
  };
}

function rgbToHsv(rgb: { r: number; g: number; b: number }): { h: number; s: number; v: number } {
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  const v = max;
  const s = max === 0 ? 0 : delta / max;

  if (delta === 0) return { h: 0, s, v };

  let h: number;
  switch (max) {
    case r:
      h = ((g - b) / delta) % 6;
      break;
    case g:
      h = (b - r) / delta + 2;
      break;
    default:
      h = (r - g) / delta + 4;
      break;
  }
  h *= 60;
  if (h < 0) h += 360;

  return { h, s, v };
}

function hsvToRgb(hsv: { h: number; s: number; v: number }): { r: number; g: number; b: number } {
  const h = ((hsv.h % 360) + 360) % 360;
  const s = Math.max(0, Math.min(1, hsv.s));
  const v = Math.max(0, Math.min(1, hsv.v));

  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;

  let r: number;
  let g: number;
  let b: number;
  if (h < 60) {
    [r, g, b] = [c, x, 0];
  } else if (h < 120) {
    [r, g, b] = [x, c, 0];
  } else if (h < 180) {
    [r, g, b] = [0, c, x];
  } else if (h < 240) {
    [r, g, b] = [0, x, c];
  } else if (h < 300) {
    [r, g, b] = [x, 0, c];
  } else {
    [r, g, b] = [c, 0, x];
  }

  return {
    r: clampChannel((r + m) * 255),
    g: clampChannel((g + m) * 255),
    b: clampChannel((b + m) * 255),
  };
}

function relativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const transform = (channel: number) => {
    const normalized = channel / 255;
    return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  };

  return 0.2126 * transform(r) + 0.7152 * transform(g) + 0.0722 * transform(b);
}

function contrastRatio(left: string, right: string): number {
  const leftLum = relativeLuminance(left);
  const rightLum = relativeLuminance(right);
  const lighter = Math.max(leftLum, rightLum);
  const darker = Math.min(leftLum, rightLum);
  return (lighter + 0.05) / (darker + 0.05);
}

export function getReadableTextColor(bgHex: string): string {
  const normalizedBg = normalizeHex(bgHex);
  const { h, s, l } = rgbToHsl(hexToRgb(normalizedBg));
  const isDark = relativeLuminance(normalizedBg) < 0.34 || l < 0.44;

  const candidate = rgbToHex(
    hslToRgb({
      h,
      s: isDark ? Math.max(s, 0.34) : Math.max(s, 0.2),
      l: isDark ? 0.82 : 0.2,
    }),
  );

  if (contrastRatio(normalizedBg, candidate) >= 4.5) {
    return candidate;
  }

  return isDark ? "#F8FAFC" : "#0F172A";
}

export function getReadableTextOnSurface(
  bgHex: string,
  preferredTextHex: string,
  surfaceHex = "#FFFFFF",
): string {
  const normalizedSurface = normalizeHex(surfaceHex);
  const normalizedPreferredText = normalizeHex(preferredTextHex);

  if (contrastRatio(normalizedPreferredText, normalizedSurface) >= 4.5) {
    return normalizedPreferredText;
  }

  const normalizedBackground = normalizeHex(bgHex);
  if (contrastRatio(normalizedBackground, normalizedSurface) >= 4.5) {
    return normalizedBackground;
  }

  return getReadableTextColor(normalizedBackground);
}

function toPredefinedColor(seed: ColorSeed): PredefinedColor {
  return {
    ...seed,
    bg: normalizeHex(seed.bg),
    text: getReadableTextColor(seed.bg),
  };
}

export const PREDEFINED_COLOR_GROUPS = PREDEFINED_COLOR_SECTIONS.map((group) => ({
  ...group,
  colors: group.colors.map(toPredefinedColor),
}));

export const PREDEFINED_COLORS: PredefinedColor[] = PREDEFINED_COLOR_GROUPS.flatMap(
  (group) => group.colors,
);

export const DEFAULT_PREDEFINED_COLOR =
  PREDEFINED_COLORS.find((color) => color.id === "slate") ?? PREDEFINED_COLORS[0]!;
export const DEFAULT_PREDEFINED_COLOR_BG = DEFAULT_PREDEFINED_COLOR.bg;

export function normalizePresetBg(bgHex: string | null | undefined): string {
  return parseHex(bgHex) ?? DEFAULT_PREDEFINED_COLOR_BG;
}

/** Returns the text color as a semi-transparent rgba for use as a border. */
export function borderColor(textHex: string, opacity = 0.35): string {
  const { r, g, b } = hexToRgb(textHex);
  return `rgba(${r},${g},${b},${opacity})`;
}

/**
 * Darkens a `#RRGGBB` hex color by scaling each channel toward black, returning
 * an `rgb(...)` string. Non-hex input is returned unchanged (used for pill/shift
 * border colors derived from a fill color).
 */
export function darkenColor(color: string, amount = 0.25): string {
  const hex = color.replace("#", "");
  if (/^[0-9a-fA-F]{6}$/.test(hex)) {
    const r = Math.max(0, Math.round(parseInt(hex.slice(0, 2), 16) * (1 - amount)));
    const g = Math.max(0, Math.round(parseInt(hex.slice(2, 4), 16) * (1 - amount)));
    const b = Math.max(0, Math.round(parseInt(hex.slice(4, 6), 16) * (1 - amount)));
    return `rgb(${r},${g},${b})`;
  }
  return color;
}

/**
 * Remaps a pastel shift-category/job color for dark mode. The preset palette
 * (`PREDEFINED_COLOR_GROUPS`) is tuned for a white page — rendered as-is on
 * an ink-black page those pale swatches read as blown-out, glaring blocks.
 *
 * Works in HSV (not HSL) deliberately: HSL's saturation is coupled to
 * lightness and reads as much more colorful near L≈0.9 than the same S does
 * near L≈0.3, so scaling HSL lightness down alone visibly tints near-white
 * "neutral" presets like Slate. HSV saturation tracks perceived chroma
 * independent of value, so scaling both proportionally keeps a low-chroma
 * pastel a neutral gray and a higher-chroma pastel recognizably that hue —
 * just richer and more vivid than a literal same-saturation "shade" would
 * be, since these presets are quite pale to begin with. Recomputes readable
 * text via the same `getReadableTextColor` used everywhere else so contrast
 * stays correct automatically.
 */
export function toDarkPillColors(bgHex: string): { bg: string; text: string } {
  const normalizedBg = normalizeHex(bgHex);
  const { h, s, v } = rgbToHsv(hexToRgb(normalizedBg));
  const darkS = Math.min(s * 1.8, 1);
  const darkV = Math.max(0.22, Math.min(v * 0.45, 0.46));
  const bg = rgbToHex(hsvToRgb({ h, s: darkS, v: darkV }));
  return { bg, text: getReadableTextColor(bg) };
}

export interface ShiftPillColors {
  color: string;
  text: string;
  border: string;
}

/**
 * Every pill gets a visible edge. `jobs.border_color` and
 * `absence_types.border_color` both default to `'transparent'` in the schema
 * and the color picker never writes anything else, so a stored border is
 * almost always the transparent sentinel — rendering it literally leaves the
 * pill as a borderless block of fill. Fall back to the same text-derived tint
 * dark mode uses so light and dark match.
 */
export function visiblePillBorder(border: string | null | undefined, textHex: string): string {
  const stored = border?.trim();
  if (!stored || stored === TRANSPARENT_BORDER) return borderColor(textHex);
  return stored;
}

/**
 * Pure (non-hook) counterpart to `toDarkPillColors`, for call sites that
 * render pills inside a loop/map — where calling a hook per-iteration would
 * break the Rules of Hooks. Callers read the active theme once via
 * `useTheme()`/`useShiftPillColors` at the top of the component and pass
 * `isDark` down into this function for each pill.
 */
export function resolveShiftPillColors(style: ShiftPillColors, isDark: boolean): ShiftPillColors {
  if (!isDark) return { ...style, border: visiblePillBorder(style.border, style.text) };

  const dark = toDarkPillColors(style.color);
  return { color: dark.bg, text: dark.text, border: borderColor(dark.text) };
}

/** Resolve a preset color by background hex, preserving valid custom colors. */
export function getPresetByBg(bgHex: string): PredefinedColor {
  const normalizedBg = normalizeHex(bgHex);
  const match = PREDEFINED_COLORS.find((color) => color.bg === normalizedBg);
  if (match) return match;

  return {
    id: `custom-${normalizedBg.slice(1).toLowerCase()}`,
    name: "Custom",
    bg: normalizedBg,
    text: getReadableTextColor(normalizedBg),
  };
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
  new: "#16A34A",
  modified: "#D97706",
  deleted: "#DC2626",
};

/**
 * Status tints for shift requests, shared by the requests board and the
 * schedule grid's request fold so the two cannot drift apart. Open reads as
 * informational (nothing is owed yet); pending approval reads as a warning
 * (someone has to act).
 */
export const SHIFT_REQUEST_STATUS_COLORS: Record<
  ShiftRequestStatus,
  { bg: string; text: string; border: string }
> = {
  open: {
    bg: "var(--dg-color-info-bg)",
    text: "var(--dg-color-info-text)",
    border: "var(--dg-color-info-border)",
  },
  pending_approval: {
    bg: "var(--dg-color-warning-bg)",
    text: "var(--dg-color-warning-text)",
    border: "var(--dg-color-warning-border)",
  },
  approved: {
    bg: "var(--dg-color-success-bg)",
    text: "var(--dg-color-success-text)",
    border: "var(--dg-color-success)",
  },
  rejected: {
    bg: "var(--dg-color-danger-bg)",
    text: "var(--dg-color-danger-dark)",
    border: "var(--dg-color-danger-border)",
  },
  cancelled: {
    bg: "var(--dg-color-bg-secondary)",
    text: "var(--dg-color-text-subtle)",
    border: "var(--dg-color-border)",
  },
  expired: {
    bg: "var(--dg-color-bg-secondary)",
    text: "var(--dg-color-text-subtle)",
    border: "var(--dg-color-border)",
  },
};
