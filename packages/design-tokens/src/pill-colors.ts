// Shared, platform-neutral pill-color darkening for dark mode. User-picked
// shift/job/absence colors (stored as hex) are tuned for a white page —
// rendered as-is on a dark surface they read as blown-out, glaring blocks
// (web) or washed-out/illegible pastels (mobile). This module remaps them.

function clampChannel(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function parseHex(hex: string | null | undefined): string | null {
  if (!hex) return null;
  const trimmed = hex.trim();

  const sixDigit = /^#?([0-9a-fA-F]{6})$/.exec(trimmed);
  if (sixDigit) {
    return `#${sixDigit[1]}`.toUpperCase();
  }

  const threeDigit = /^#?([0-9a-fA-F]{3})$/.exec(trimmed);
  if (threeDigit) {
    const [, r, g, b] = threeDigit;
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
  }

  return null;
}

function normalizeHex(hex: string): string {
  return parseHex(hex) ?? "#E2E8F0";
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

/** Returns the text color as a semi-transparent rgba for use as a border. */
export function borderColor(textHex: string, opacity = 0.35): string {
  const { r, g, b } = hexToRgb(textHex);
  return `rgba(${r},${g},${b},${opacity})`;
}

/**
 * Remaps a pastel shift/job/absence color for dark mode. Works in HSV (not
 * HSL) deliberately: HSL's saturation is coupled to lightness and reads as
 * much more colorful near L≈0.9 than the same S does near L≈0.3, so scaling
 * HSL lightness down alone visibly tints near-white "neutral" presets. HSV
 * saturation tracks perceived chroma independent of value, so scaling both
 * proportionally keeps a low-chroma pastel a neutral gray and a
 * higher-chroma pastel recognizably that hue — just richer and more vivid
 * than a literal same-saturation "shade" would be. Recomputes readable text
 * via `getReadableTextColor` so contrast stays correct automatically.
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
 * Pure (non-hook) helper for call sites that build pills inside a loop/map —
 * where calling a hook per-iteration would break the Rules of Hooks. Callers
 * read the active theme once at the top of the component and pass `isDark`
 * down into this function for each pill.
 */
export function resolveShiftPillColors(style: ShiftPillColors, isDark: boolean): ShiftPillColors {
  if (!isDark) return style;

  const dark = toDarkPillColors(style.color);
  return { color: dark.bg, text: dark.text, border: borderColor(dark.text) };
}
