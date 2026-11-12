import { StyleSheet } from "react-native";
import { describe, expect, it } from "vitest";
import { mobileRadii, mobileSpace, mobileColors } from "../../../shared/theme/tokens";
import { createStyles } from "./scheduleScreenStyles";

describe("hero card corners", () => {
  const styles = createStyles(mobileColors, false);
  const flat = (style: unknown) => StyleSheet.flatten(style as never) as Record<string, unknown>;

  it("curves the card around the date tile's corner centre", () => {
    const radius = mobileSpace.lg + mobileRadii.control;
    expect(flat(styles.meHeroCard).borderRadius).toBe(radius);
    expect(flat(styles.meHeroCardClip).borderRadius).toBe(radius);
    expect(flat(styles.meHeroCardClip).paddingHorizontal).toBe(mobileSpace.lg);
    expect(flat(styles.meHeroDateTile).borderRadius).toBe(mobileRadii.control);
  });

  it("draws every rounded part with the continuous (iOS) curve", () => {
    for (const style of [
      styles.meHeroCard,
      styles.meHeroCardClip,
      styles.meHeroDateTile,
      styles.meHeroCollaborators,
    ]) {
      expect(flat(style).borderCurve).toBe("continuous");
    }
  });

  it("drops the last Working with block onto the card's curve", () => {
    expect(flat(styles.meHeroCollaboratorsLast).marginBottom).toBe(0);
  });
});
