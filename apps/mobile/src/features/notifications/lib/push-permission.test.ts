import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  constants: { executionEnvironment: "standalone" } as {
    expoConfig?: unknown;
    easConfig?: unknown;
    executionEnvironment: string;
  },
}));
const constants = mocks.constants;

vi.mock("expo-constants", () => ({
  ExecutionEnvironment: { Bare: "bare", Standalone: "standalone", StoreClient: "storeClient" },
  default: mocks.constants,
}));
vi.mock("expo-device", () => ({ isDevice: true }));
vi.mock("react-native", () => ({ Platform: { OS: "ios" } }));

import { MissingPushProjectIdError, resolveExpoProjectId } from "./push-permission";

describe("resolveExpoProjectId", () => {
  beforeEach(() => {
    constants.expoConfig = undefined;
    constants.easConfig = undefined;
  });

  it("reads the id a build profile writes into the config", () => {
    constants.expoConfig = { extra: { eas: { projectId: "project-1" } } };
    expect(resolveExpoProjectId()).toBe("project-1");
  });

  it("falls back to the legacy easConfig an older build carries", () => {
    constants.easConfig = { projectId: "project-legacy" };
    expect(resolveExpoProjectId()).toBe("project-legacy");
  });

  it("answers null rather than an empty id when the build has none", () => {
    expect(resolveExpoProjectId()).toBeNull();
    constants.expoConfig = { extra: { eas: { projectId: "" } } };
    expect(resolveExpoProjectId()).toBeNull();
    constants.expoConfig = { extra: {} };
    expect(resolveExpoProjectId()).toBeNull();
  });

  it("names the setting to change in its error", () => {
    const error = new MissingPushProjectIdError();
    expect(error.message).toContain("expo.extra.eas.projectId");
    expect(error.name).toBe("MissingPushProjectIdError");
  });
});
