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
 * Generated in OKLCH: ten chromatic slots spaced 36 degrees apart at close to
 * the highest chroma each hue can hold, plus one desaturated slate. Light
 * backgrounds sit near L 0.82 so a chip reads as a color, not a tint. Hue alone
 * cannot separate eleven chips, so adjacent slots also alternate lightness;
 * that second axis is what stops neighbours like blue and indigo reading as the
 * same color in a dense list. `avatar-tone.test.ts` gates both properties:
 * every background/text pairing clears WCAG AA (>=4.5:1), and no two slots fall
 * within an OKLab deltaE of 0.05.
 */
const AVATAR_HUES: AvatarHue[] = [
  {
    name: "blue",
    light: { background: "#AFCDFA", border: "#78ABF7", text: "#174A92" },
    dark: { background: "#1352A7", border: "#2E6FCD", text: "#B0CEFA" },
  },
  {
    name: "indigo",
    light: { background: "#C0B1F9", border: "#A385F6", text: "#51398A" },
    dark: { background: "#522E96", border: "#6D4DB6", text: "#CDC1FA" },
  },
  {
    name: "magenta",
    light: { background: "#FAACF3", border: "#E47EDC", text: "#722C6E" },
    dark: { background: "#84297F", border: "#A4499E", text: "#EDB6E7" },
  },
  {
    name: "rose",
    light: { background: "#F99FB2", border: "#F0688C", text: "#822341" },
    dark: { background: "#85153D", border: "#AB3157", text: "#FAB4C2" },
  },
  {
    name: "orange",
    light: { background: "#FABAA1", border: "#F88658", text: "#7E3310" },
    dark: { background: "#8C3913", border: "#B74D1C", text: "#FABBA3" },
  },
  {
    name: "amber",
    light: { background: "#F1AF36", border: "#C8912B", text: "#61440F" },
    dark: { background: "#60440F", border: "#835E19", text: "#EBC487" },
  },
  {
    name: "lime",
    light: { background: "#CAD657", border: "#A9B430", text: "#4D5211" },
    dark: { background: "#555B14", border: "#72791D", text: "#CDD590" },
  },
  {
    name: "green",
    light: { background: "#6ED888", border: "#34B860", text: "#13592B" },
    dark: { background: "#13582A", border: "#1D793C", text: "#A0DCAC" },
  },
  {
    name: "teal",
    light: { background: "#43E7D8", border: "#37C1B5", text: "#145952" },
    dark: { background: "#17635C", border: "#22827A", text: "#87E3D8" },
  },
  {
    name: "cyan",
    light: { background: "#42CFF9", border: "#31ACCF", text: "#125265" },
    dark: { background: "#125264", border: "#1D7088", text: "#85D8F5" },
  },
  {
    name: "slate",
    light: { background: "#B2B8C2", border: "#8F97A6", text: "#3F4754" },
    dark: { background: "#3F4551", border: "#586170", text: "#C7CBD2" },
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
