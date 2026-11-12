/**
 * The "my schedule" hero card treatment, shared by the web dashboard and the
 * mobile schedule screen.
 *
 * The card is a mesh gradient: soft pools of colour laid over a royal-blue
 * base, darkest at the bottom left and brightest at the top right, with a
 * violet glow at the bottom right. A fine navy dot screen covers the whole
 * card. Web paints it with CSS radial gradients and mobile with SVG, both
 * from these numbers, so the two cards match.
 */

/**
 * One pool of colour in the mesh: an ellipse centred at (`x`, `y`) whose radii
 * are `radius` of the card's width and height, fading from `color` at its
 * centre to transparent at its edge. Coordinates are fractions of the card,
 * (0, 0) at the top left.
 */
export type HeroMeshPool = {
  readonly color: string;
  readonly x: number;
  readonly y: number;
  readonly radius: number;
};

/** Pools are listed in paint order: each one lies over the ones before it. */
export type HeroMesh = {
  readonly base: string;
  readonly pools: readonly HeroMeshPool[];
};

export type HeroDotInk = { readonly color: string; readonly opacity: number };

export const heroMeshTokens: { readonly light: HeroMesh; readonly dark: HeroMesh } = {
  light: {
    base: "#1D3BA8",
    pools: [
      { color: "#1E3FAF", x: 0.55, y: 0.5, radius: 0.45 },
      // Brand blue a step deeper: the title row's white chip labels sit here
      // and need AA against it.
      { color: "#2251D8", x: 0.08, y: 0.08, radius: 0.65 },
      { color: "#6D5BF6", x: 0.95, y: 0.95, radius: 0.7 },
      { color: "#60A5FA", x: 1, y: 0, radius: 0.78 },
      { color: "#0A144C", x: 0, y: 1, radius: 0.82 },
    ],
  },
  // The same pools a step deeper, ending in the dark-mode brand blue's range
  // rather than sky, which would glare on a near-black page.
  dark: {
    base: "#142A8C",
    pools: [
      { color: "#132C8E", x: 0.55, y: 0.5, radius: 0.45 },
      { color: "#1D44D6", x: 0.08, y: 0.08, radius: 0.65 },
      { color: "#4C3BC9", x: 0.95, y: 0.95, radius: 0.7 },
      { color: "#2F86FF", x: 1, y: 0, radius: 0.78 },
      { color: "#040926", x: 0, y: 1, radius: 0.82 },
    ],
  },
};

/**
 * The dot screen: `radius` px dots every `spacing` px. The ink is navy at a
 * low opacity so the mesh stays the dominant colour and the dots read as grain.
 */
export const heroDotTokens = {
  spacing: 3.08,
  radius: 0.74,
  inkLight: { color: "#060C30", opacity: 0.12 } as HeroDotInk,
  inkDark: { color: "#020518", opacity: 0.14 } as HeroDotInk,
} as const;

export const heroGradientTokens = {
  /**
   * The "Working with" collaborator pill — a solid navy fill, not a
   * translucent white overlay, so it reads as a distinct block on the gradient.
   */
  collaboratorLight: "#3A55CB",
  collaboratorDark: "#1E2F66",
  shadowLight: "rgba(37, 99, 235, 0.3)",
  shadowDark: "rgba(32, 117, 255, 0.28)",
} as const;

export function getHeroMesh(isDark: boolean): HeroMesh {
  return isDark ? heroMeshTokens.dark : heroMeshTokens.light;
}

export function getHeroDotInk(isDark: boolean): HeroDotInk {
  return isDark ? heroDotTokens.inkDark : heroDotTokens.inkLight;
}

function rgba(hex: string, alpha: number): string {
  const value = Number.parseInt(hex.slice(1), 16);
  return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${alpha})`;
}

const percent = (fraction: number) => `${Math.round(fraction * 1000) / 10}%`;

/**
 * The web hero's background as layered CSS on the card itself, dots first so
 * they sit over the mesh. Each pool fades to its own colour at zero alpha, not
 * to `transparent`, so the edge never greys.
 */
export function getHeroBackgroundCss(isDark: boolean): {
  backgroundColor: string;
  backgroundImage: string;
  backgroundSize: string;
} {
  const mesh = getHeroMesh(isDark);
  const ink = getHeroDotInk(isDark);
  const { radius, spacing } = heroDotTokens;
  const dots = `radial-gradient(${rgba(ink.color, ink.opacity)} ${radius}px, ${rgba(ink.color, 0)} ${radius + 0.4}px)`;
  const pools = [...mesh.pools]
    .reverse()
    .map(
      (pool) =>
        `radial-gradient(ellipse ${percent(pool.radius)} ${percent(pool.radius)} at ${percent(pool.x)} ${percent(pool.y)}, ${pool.color} 0%, ${rgba(pool.color, 0)} 100%)`,
    );

  return {
    backgroundColor: mesh.base,
    backgroundImage: [dots, ...pools].join(", "),
    backgroundSize: [`${spacing}px ${spacing}px`, ...pools.map(() => "100% 100%")].join(", "),
  };
}
