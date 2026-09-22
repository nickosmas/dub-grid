import { describe, expect, it } from "vitest";
import { SHADOW_BLEED, getPreviewStageScale } from "./OnboardingPreviewStage";

describe("getPreviewStageScale", () => {
  it("keeps real size while the card and its shadow fit", () => {
    expect(getPreviewStageScale(400, 300)).toBe(1);
    expect(getPreviewStageScale(300 + SHADOW_BLEED, 300)).toBe(1);
  });

  it("shrinks just enough for the card and its shadow on a short slide", () => {
    expect(getPreviewStageScale(248, 400)).toBeCloseTo((248 - SHADOW_BLEED) / 400);
  });

  it("never scales on a guess", () => {
    expect(getPreviewStageScale(null, 300)).toBe(1);
    expect(getPreviewStageScale(400, null)).toBe(1);
    expect(getPreviewStageScale(400, 0)).toBe(1);
  });

  it("never goes negative when the slide is shorter than the bleed", () => {
    expect(getPreviewStageScale(20, 300)).toBe(0);
  });
});
