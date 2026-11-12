import { describe, expect, it } from "vitest";
import { getHeroBackgroundCss, heroDotTokens, heroMeshTokens } from "./hero-gradient";

describe("hero mesh", () => {
  it("places the dark pools exactly where the light ones are", () => {
    const shape = (pools: typeof heroMeshTokens.light.pools) =>
      pools.map(({ x, y, radius }) => ({ x, y, radius }));
    expect(shape(heroMeshTokens.dark.pools)).toEqual(shape(heroMeshTokens.light.pools));
  });

  it("keeps every pool on the card", () => {
    for (const mesh of [heroMeshTokens.light, heroMeshTokens.dark]) {
      for (const pool of mesh.pools) {
        expect(pool.x).toBeGreaterThanOrEqual(0);
        expect(pool.x).toBeLessThanOrEqual(1);
        expect(pool.y).toBeGreaterThanOrEqual(0);
        expect(pool.y).toBeLessThanOrEqual(1);
        expect(pool.radius).toBeGreaterThan(0);
      }
    }
  });
});

describe("getHeroBackgroundCss", () => {
  const layers = (css: string) => css.split(/,\s*(?=radial-gradient)/);

  it("paints the dots over the mesh, and the last pool over the others", () => {
    const { backgroundImage } = getHeroBackgroundCss(false);
    const [dots, top] = layers(backgroundImage);
    expect(dots).toContain(`${heroDotTokens.radius}px`);
    const lastPool = heroMeshTokens.light.pools.at(-1)!;
    expect(top).toContain(`${lastPool.color} 0%`);
    expect(top).toContain("at 0% 100%");
  });

  it("sizes the dot layer to its spacing and every pool to the card", () => {
    const { backgroundImage, backgroundSize } = getHeroBackgroundCss(true);
    const sizes = backgroundSize.split(", ");
    expect(sizes).toHaveLength(layers(backgroundImage).length);
    expect(sizes[0]).toBe(`${heroDotTokens.spacing}px ${heroDotTokens.spacing}px`);
    expect(new Set(sizes.slice(1))).toEqual(new Set(["100% 100%"]));
  });

  it("fades each pool to its own colour rather than to grey", () => {
    const { backgroundImage } = getHeroBackgroundCss(false);
    expect(backgroundImage).not.toContain("transparent");
    // #60A5FA -> 96, 165, 250
    expect(backgroundImage).toContain("#60A5FA 0%, rgba(96, 165, 250, 0) 100%");
  });

  it("sits the mesh on each theme's base colour", () => {
    expect(getHeroBackgroundCss(false).backgroundColor).toBe(heroMeshTokens.light.base);
    expect(getHeroBackgroundCss(true).backgroundColor).toBe(heroMeshTokens.dark.base);
  });
});
