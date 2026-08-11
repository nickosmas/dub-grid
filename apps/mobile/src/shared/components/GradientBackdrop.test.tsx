import { render } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { mobileSoftGradientStops } from "../theme/tokens";
import { createReactNativeModule } from "../../test/native";

vi.mock("react-native", async () => createReactNativeModule(await import("react")));

// The gradient shim drops its color props before they reach the DOM, so capture
// them at the boundary instead.
const gradientProps: Array<Record<string, unknown>> = [];

vi.mock("expo-linear-gradient", () => ({
  LinearGradient: (props: Record<string, unknown>) => {
    gradientProps.push(props);
    return null;
  },
}));

let GradientBackdrop: (typeof import("./GradientBackdrop"))["GradientBackdrop"];

beforeAll(async () => {
  GradientBackdrop = (await import("./GradientBackdrop")).GradientBackdrop;
});

beforeEach(() => {
  gradientProps.length = 0;
});

function lastGradient() {
  return gradientProps.at(-1) ?? {};
}

describe("GradientBackdrop", () => {
  it("defaults to the brandWash kind", () => {
    render(<GradientBackdrop />);
    expect(lastGradient().colors).toEqual(mobileSoftGradientStops("brandWash", false));
  });

  it("passes the requested kind's stops through", () => {
    render(<GradientBackdrop kind="aurora" />);
    expect(lastGradient().colors).toEqual(mobileSoftGradientStops("aurora", false));
  });

  it("fills its parent by default and caps the aurora halo", () => {
    render(<GradientBackdrop />);
    expect(lastGradient().style).toEqual(
      expect.arrayContaining([expect.objectContaining({ height: "100%" })]),
    );

    render(<GradientBackdrop kind="aurora" />);
    expect(lastGradient().style).toEqual(
      expect.arrayContaining([expect.objectContaining({ height: 320 })]),
    );
  });

  it("honors an explicit height", () => {
    render(<GradientBackdrop height={240} />);
    expect(lastGradient().style).toEqual(
      expect.arrayContaining([expect.objectContaining({ height: 240 })]),
    );
  });

  it("stays out of the touch and accessibility trees", () => {
    render(<GradientBackdrop />);
    const props = lastGradient();

    expect(props.pointerEvents).toBe("none");
    expect(props.accessibilityElementsHidden).toBe(true);
    expect(props.importantForAccessibility).toBe("no-hide-descendants");
  });
});
