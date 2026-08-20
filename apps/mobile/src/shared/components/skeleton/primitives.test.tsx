import { beforeAll, describe, expect, it, vi } from "vitest";
import { createReactNativeModule } from "../../../test/native";

vi.mock("react-native", async () => createReactNativeModule(await import("react")));

let skeletonBandColors: (typeof import("./primitives"))["skeletonBandColors"];

beforeAll(async () => {
  skeletonBandColors = (await import("./primitives")).skeletonBandColors;
});

describe("skeletonBandColors", () => {
  // Load-bearing: `"transparent"` here is `rgba(0,0,0,0)`, and iOS's CGGradient
  // interpolates un-premultiplied, so a black-to-white ramp greys the band's
  // edges while Android's premultiplied shader fades cleanly. Matching the RGB
  // across the stops is what makes the two platforms render the same shimmer.
  it("fades out through the highlight's own colour, never through black", () => {
    expect(skeletonBandColors("rgba(255,255,255,0.62)")).toEqual([
      "rgba(255,255,255,0)",
      "rgba(255,255,255,0.62)",
      "rgba(255,255,255,0)",
    ]);
  });

  it("handles the dark theme's spacing and low alpha", () => {
    expect(skeletonBandColors("rgba(255, 255, 255, 0.055)")).toEqual([
      "rgba(255,255,255,0)",
      "rgba(255, 255, 255, 0.055)",
      "rgba(255,255,255,0)",
    ]);
  });

  it("leaves a colour it cannot parse opaque rather than reintroducing black", () => {
    expect(skeletonBandColors("#FFFFFF")).toEqual(["#FFFFFF", "#FFFFFF", "#FFFFFF"]);
  });
});
