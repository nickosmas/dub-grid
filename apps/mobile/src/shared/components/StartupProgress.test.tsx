import { render, screen } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createReactNativeModule } from "../../test/native";

vi.mock("react-native", async () => createReactNativeModule(await import("react")));

let motionEnabled = true;

vi.mock("../motion/useMotionPreference", () => ({
  useMotionPreference: () => ({
    enabled: motionEnabled,
    d: (ms: number) => (motionEnabled ? ms : 0),
    spring: () => ({}),
    timing: (_name: string, ms: number) => ({ duration: motionEnabled ? ms : 0 }),
  }),
}));

let StartupProgress: (typeof import("./StartupProgress"))["StartupProgress"];

beforeAll(async () => {
  StartupProgress = (await import("./StartupProgress")).StartupProgress;
});

beforeEach(() => {
  motionEnabled = true;
});

describe("StartupProgress", () => {
  it("announces itself as a progress indicator", () => {
    render(<StartupProgress />);

    const track = screen.getByTestId("startup-progress");
    expect(track.getAttribute("role")).toBe("progressbar");
    expect(track.getAttribute("aria-label")).toBe("Loading");
  });

  // The indicator is the only thing separating "loading" from "stuck" once the
  // brand mark stopped moving, so reduced motion must not remove it.
  it("still renders its bar when motion is reduced", () => {
    motionEnabled = false;

    render(<StartupProgress />);

    expect(screen.getByTestId("startup-progress")).toBeInTheDocument();
    expect(screen.getByTestId("startup-progress-bar")).toBeInTheDocument();
  });
});
