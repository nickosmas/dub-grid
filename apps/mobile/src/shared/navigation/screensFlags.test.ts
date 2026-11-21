import { beforeEach, describe, expect, it, vi } from "vitest";

const platform = vi.hoisted(() => ({ OS: "ios" }));
const experiment = vi.hoisted(() => ({
  synchronousScreenUpdatesEnabled: true,
  synchronousHeaderConfigUpdatesEnabled: true,
  synchronousHeaderSubviewUpdatesEnabled: true,
}));

vi.mock("react-native", () => ({ Platform: platform }));
vi.mock("react-native-screens", () => ({ featureFlags: { experiment } }));

import { configureNativeStackUpdates } from "./screensFlags";

describe("configureNativeStackUpdates", () => {
  beforeEach(() => {
    experiment.synchronousScreenUpdatesEnabled = true;
    experiment.synchronousHeaderConfigUpdatesEnabled = true;
    experiment.synchronousHeaderSubviewUpdatesEnabled = true;
  });

  it("turns the native stack's synchronous layout updates off on iOS", () => {
    platform.OS = "ios";
    configureNativeStackUpdates();
    expect(experiment).toEqual({
      synchronousScreenUpdatesEnabled: false,
      synchronousHeaderConfigUpdatesEnabled: false,
      synchronousHeaderSubviewUpdatesEnabled: false,
    });
  });

  it("leaves Android as it was", () => {
    platform.OS = "android";
    configureNativeStackUpdates();
    expect(experiment.synchronousHeaderConfigUpdatesEnabled).toBe(true);
  });
});
