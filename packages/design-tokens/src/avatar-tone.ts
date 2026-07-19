export type AvatarTone = {
  backgroundColor: string;
  borderColor: string;
  textColor: string;
};

export type AvatarGradientTone = {
  gradientFrom: string;
  gradientTo: string;
  textColor: string;
};

type AvatarPaletteEntry = {
  background: string;
  border: string;
  text: string;
  gradientTo: string;
};

// Curated, WCAG AA-verified (>=4.5:1) palette. Replaces continuous hue
// rotation, which produced low-contrast badges for hues (yellow/green) that
// read lighter than others at the same fixed HSL lightness. `gradientTo` is
// a darkened shade of `text` used for presence-avatar gradients so a
// person's gradient and flat avatar share the same hue family.
const AVATAR_PALETTE: AvatarPaletteEntry[] = [
  { background: "#DCE9FE", border: "#B6CEFB", text: "#1D4ED8", gradientTo: "#123086" },
  { background: "#E3E1FD", border: "#C4C1FB", text: "#4F3CC9", gradientTo: "#31257D" },
  { background: "#EFE1FE", border: "#DCC4FB", text: "#7E22CE", gradientTo: "#4E1580" },
  { background: "#FBE1F1", border: "#F5C1E1", text: "#A8156F", gradientTo: "#680D45" },
  { background: "#FDE1E4", border: "#FAC0C7", text: "#B91C4B", gradientTo: "#73112E" },
  { background: "#FDECC8", border: "#F9D48A", text: "#92400E", gradientTo: "#5B2809" },
  { background: "#DBF3E1", border: "#B4E5C2", text: "#0E6B34", gradientTo: "#094220" },
  { background: "#D3F1EC", border: "#A5E4D8", text: "#0F766E", gradientTo: "#094944" },
  { background: "#D6EFF7", border: "#AEE0EE", text: "#0E6B8C", gradientTo: "#094257" },
  { background: "#E4E7EC", border: "#C9CFD9", text: "#374151", gradientTo: "#222832" },
  { background: "#F0E2D6", border: "#E0C4AC", text: "#7A4A24", gradientTo: "#4C2E16" },
];

// Dark-mode counterpart, same hue order as `AVATAR_PALETTE`. Derived from
// each light entry's already-saturated `text` hue (not the pale background)
// so the dark chip reads as a rich, vivid jewel tone rather than a muted
// gray — same "vibrant, not washed out" treatment as shift pills, with a
// bright tint of the same hue for text. Each pairing is WCAG AA-verified
// (>=4.5:1).
const DARK_AVATAR_PALETTE: Omit<AvatarPaletteEntry, "gradientTo">[] = [
  { background: "#0C2A80", border: "#24449F", text: "#AABDF2" },
  { background: "#2E2280", border: "#483C9F", text: "#B3AAF2" },
  { background: "#4C1080", border: "#68299F", text: "#D0AAF2" },
  { background: "#800A52", border: "#9F226E", text: "#F2AAD6" },
  { background: "#800E30", border: "#9F274A", text: "#F2AABF" },
  { background: "#803406", border: "#9F4F1E", text: "#F2C5AA" },
  { background: "#0B803B", border: "#239F56", text: "#D4FFE5" },
  { background: "#0B8076", border: "#239F94", text: "#E6FFFD" },
  { background: "#076080", border: "#1F7D9F", text: "#AADFF2" },
  { background: "#365280", border: "#516E9F", text: "#ABC8F5" },
  { background: "#804B21", border: "#9F673B", text: "#F2CAAA" },
];

function hashSeed(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (Math.imul(31, hash) + value.charCodeAt(index)) | 0;
  }
  return Math.abs(hash);
}

function paletteEntryFor(seed: string): AvatarPaletteEntry {
  return AVATAR_PALETTE[hashSeed(seed) % AVATAR_PALETTE.length];
}

export function getAvatarTone(seed: string, isDark = false): AvatarTone {
  const index = hashSeed(seed) % AVATAR_PALETTE.length;
  const entry = isDark ? DARK_AVATAR_PALETTE[index] : AVATAR_PALETTE[index];
  return {
    backgroundColor: entry.background,
    borderColor: entry.border,
    textColor: entry.text,
  };
}

export function getAvatarGradientTone(seed: string): AvatarGradientTone {
  const entry = paletteEntryFor(seed);
  return {
    gradientFrom: entry.text,
    gradientTo: entry.gradientTo,
    textColor: "#FFFFFF",
  };
}
