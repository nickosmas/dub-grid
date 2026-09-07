export type AvatarTone = {
  backgroundColor: string;
  borderColor: string;
  textColor: string;
};

type AvatarSurface = {
  background: string;
  border: string;
  text: string;
};

type AvatarHue = {
  /** Documentation only, so the array stays readable. */
  name: string;
  light: AvatarSurface;
  dark: AvatarSurface;
};

/**
 * A person's whole color identity is one row here. Every avatar in both apps
 * draws this same chip, presence included, so someone looks the same in the
 * people table, on their own profile, and beside a cell they are editing.
 *
 * Sixteen softened colors from the approved avatar preview, spanning bright,
 * earthy, and neutral hues. A few dark fills have small lightness adjustments
 * to preserve the existing perceptual-distance threshold. Tests hold every
 * text/background pairing at WCAG AA (>=4.5:1), with at least 0.05 OKLab
 * deltaE between every pair of fills.
 */
const AVATAR_HUES: AvatarHue[] = [
  {
    name: "cornflower",
    light: { background: "#A3C5FB", border: "#82AAE6", text: "#173D75" },
    dark: { background: "#1F5BAB", border: "#3876D0", text: "#D0E2FC" },
  },
  {
    name: "sunflower",
    light: { background: "#F6DC70", border: "#D7BD4F", text: "#59440B" },
    dark: { background: "#795D11", border: "#AA9038", text: "#FFF6CC" },
  },
  {
    name: "terracotta",
    light: { background: "#F2A890", border: "#DB8870", text: "#612719" },
    dark: { background: "#9B462F", border: "#BC644B", text: "#FFE8DF" },
  },
  {
    name: "sea glass",
    light: { background: "#87EACB", border: "#64C6A8", text: "#14503F" },
    dark: { background: "#23735C", border: "#33977D", text: "#D7FFF0" },
  },
  {
    name: "lilac",
    light: { background: "#D7AFF3", border: "#BB8EDC", text: "#512467" },
    dark: { background: "#7C3D9C", border: "#995EBB", text: "#F4E3FF" },
  },
  {
    name: "moss",
    light: { background: "#B8C780", border: "#9BAA62", text: "#354116" },
    dark: { background: "#566A27", border: "#778E44", text: "#EEF6CC" },
  },
  {
    name: "candy pink",
    light: { background: "#F8AACD", border: "#E086AE", text: "#721F47" },
    dark: { background: "#9C3768", border: "#BD5888", text: "#FFE3F1" },
  },
  {
    name: "glacier",
    light: { background: "#94E2F9", border: "#6BC6E0", text: "#154F61" },
    dark: { background: "#21738C", border: "#3C93AC", text: "#E2F8FF" },
  },
  {
    name: "apricot",
    light: { background: "#FAC783", border: "#DFAA61", text: "#673B0A" },
    dark: { background: "#945916", border: "#BD833B", text: "#FFEED2" },
  },
  {
    name: "denim",
    light: { background: "#9FB7D2", border: "#809DBD", text: "#253D57" },
    dark: { background: "#33557F", border: "#51759F", text: "#E3EFFF" },
  },
  {
    name: "pistachio",
    light: { background: "#D7EC85", border: "#BACF66", text: "#465411" },
    dark: { background: "#799035", border: "#8CA844", text: "#202020" },
  },
  {
    name: "cocoa",
    light: { background: "#D3A988", border: "#B88C6B", text: "#472A15" },
    dark: { background: "#7E4E2C", border: "#A26E47", text: "#FFECDA" },
  },
  {
    name: "lagoon",
    light: { background: "#74CFD1", border: "#55B1B5", text: "#10454B" },
    dark: { background: "#18696F", border: "#358F97", text: "#D7FBFF" },
  },
  {
    name: "oat",
    light: { background: "#E6CCAC", border: "#CAAD87", text: "#584022" },
    dark: { background: "#886A43", border: "#A5855C", text: "#FFF2DF" },
  },
  {
    name: "jade",
    light: { background: "#88DF9D", border: "#59C57D", text: "#13592B" },
    dark: { background: "#1F6035", border: "#288046", text: "#C6EACD" },
  },
  {
    name: "silver",
    light: { background: "#C0C5CD", border: "#A3AAB6", text: "#3F4754" },
    dark: { background: "#494E5A", border: "#606977", text: "#DDE0E4" },
  },
];

function hashSeed(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (Math.imul(31, hash) + value.charCodeAt(index)) | 0;
  }
  return Math.abs(hash);
}

function hueFor(seed: string): AvatarHue {
  return AVATAR_HUES[hashSeed(seed) % AVATAR_HUES.length];
}

/**
 * A person's color identity.
 *
 * Prefer the linked account id so presence, the signed-in avatar, and the
 * people table agree for anyone who can log in: those surfaces only ever know
 * one id or the other, and seeding them differently gave the same person two
 * colors. Staff with no account fall back to their employee id.
 */
export function resolveAvatarSeed(person: { userId?: string | null; id: string }): string {
  return person.userId ?? person.id;
}

export function getAvatarTone(seed: string, isDark = false): AvatarTone {
  const hue = hueFor(seed);
  const surface = isDark ? hue.dark : hue.light;
  return {
    backgroundColor: surface.background,
    borderColor: surface.border,
    textColor: surface.text,
  };
}
