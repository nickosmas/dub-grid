import { beforeAll, describe, expect, it, vi } from "vitest";
import { createReactNativeModule } from "../../../test/native";

vi.mock("react-native", async () => createReactNativeModule(await import("react")));
vi.mock("expo-router", () => ({ router: { push: vi.fn() } }));
vi.mock("@expo/vector-icons/Ionicons", () => ({ default: () => null }));

let getOpenShiftsEmptyCopy: (typeof import("./OpenShiftsCard"))["getOpenShiftsEmptyCopy"];

beforeAll(async () => {
  getOpenShiftsEmptyCopy = (await import("./OpenShiftsCard")).getOpenShiftsEmptyCopy;
});

describe("getOpenShiftsEmptyCopy", () => {
  it("says an unpublished period has nothing to show yet, not that nothing is open", () => {
    expect(getOpenShiftsEmptyCopy("unpublished")).toEqual({
      title: "Not published yet",
      body: "Open shifts will appear after this period is published.",
    });
  });

  it("limits a partly published period's empty state to its published dates", () => {
    expect(getOpenShiftsEmptyCopy("partial").title).toBe("No open shifts on published dates");
  });

  it("keeps the plain empty state for a published period", () => {
    expect(getOpenShiftsEmptyCopy()).toEqual({ title: "No open shifts right now" });
  });
});
