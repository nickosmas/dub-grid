import { beforeEach, describe, expect, it, vi } from "vitest";

// `pushUnsupported` is computed at module scope, and the shared expo-constants
// shim reports Expo Go so every other suite short-circuits. Override it here to
// exercise the real path.
vi.mock("expo-constants", () => ({
  ExecutionEnvironment: {
    Bare: "bare",
    Standalone: "standalone",
    StoreClient: "storeClient",
  },
  default: { executionEnvironment: "standalone" },
}));

vi.mock("react-native", () => ({
  Platform: { OS: "ios" },
}));

const getPermissionsAsync = vi.fn();
const requestPermissionsAsync = vi.fn();

vi.mock("expo-notifications", () => ({
  getPermissionsAsync: (...a: unknown[]) => getPermissionsAsync(...a),
  requestPermissionsAsync: (...a: unknown[]) => requestPermissionsAsync(...a),
}));

import {
  getPushPermissionState,
  requestPushPermission,
  resolvePermissionState,
} from "./push-permission";

describe("push permission", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("maps the OS answer onto the four states", () => {
    expect(resolvePermissionState("unsupported")).toBe("unsupported");
    expect(resolvePermissionState({ granted: true, canAskAgain: false })).toBe("granted");
    expect(resolvePermissionState({ granted: false, canAskAgain: true })).toBe("undetermined");
    expect(resolvePermissionState({ granted: false, canAskAgain: false })).toBe("denied");
  });

  it("reads the current answer without prompting", async () => {
    getPermissionsAsync.mockResolvedValue({ granted: false, canAskAgain: true });

    await expect(getPushPermissionState()).resolves.toBe("undetermined");
    expect(requestPermissionsAsync).not.toHaveBeenCalled();
  });

  it("prompts and reports the answer", async () => {
    requestPermissionsAsync.mockResolvedValue({ granted: false, canAskAgain: false });

    await expect(requestPushPermission()).resolves.toBe("denied");
    expect(requestPermissionsAsync).toHaveBeenCalledTimes(1);
  });
});
