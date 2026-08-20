/**
 * The "my schedule" hero card treatment, shared by the web dashboard and the
 * mobile schedule screen.
 *
 * Both apps had their own copy of these hexes, each with a comment pointing at
 * the other ("matches the web hero gradient" / "matches the mobile hero card").
 * That is a token, so here it is.
 *
 * Dark mode keeps the same dark-navy start but ends in the app's vivid
 * dark-mode brand blue rather than a pale periwinkle, which would read as a
 * washed-out pastel blob on a near-black page.
 */

export type HeroGradientStops = readonly [string, string, string];

export const heroGradientTokens = {
  /** Dark bottom-left → light top-right. */
  stopsLight: ["#142579", "#2C49CC", "#6E90FF"] as HeroGradientStops,
  stopsDark: ["#0A1442", "#1D3AA0", "#2075FF"] as HeroGradientStops,
  /** Stop positions, 0-1, matching `stopsLight`/`stopsDark` by index. */
  locations: [0, 0.55, 1] as readonly [number, number, number],
  /** Flat card fill for surfaces that can't render a gradient. */
  cardLight: "#2946C7",
  cardDark: "#152238",
  /**
   * The "Working with" collaborator pill — a solid navy fill, not a
   * translucent white overlay, so it reads as a distinct block on the gradient.
   */
  collaboratorLight: "#3A55CB",
  collaboratorDark: "#1E2F66",
  shadowLight: "rgba(37, 99, 235, 0.3)",
  shadowDark: "rgba(32, 117, 255, 0.28)",
} as const;

/** CSS `linear-gradient(...)` for the web dashboard hero. */
export function getHeroGradientCss(isDark: boolean): string {
  const stops = isDark ? heroGradientTokens.stopsDark : heroGradientTokens.stopsLight;
  const parts = stops.map(
    (stop, index) => `${stop} ${Math.round(heroGradientTokens.locations[index] * 100)}%`,
  );

  return `linear-gradient(to top right, ${parts.join(", ")})`;
}
