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

export function getAvatarTone(seed: string): AvatarTone {
  const entry = paletteEntryFor(seed);
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
