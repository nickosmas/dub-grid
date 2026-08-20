import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const routerPush = vi.fn();
const invalidateQueries = vi.fn();
const getLastNotificationResponseAsync = vi.fn();
const addNotificationReceivedListener = vi.fn();
const addNotificationResponseReceivedListener = vi.fn();
const setNotificationHandler = vi.fn();

vi.mock("expo-router", () => ({
  router: { push: (...args: unknown[]) => routerPush(...args) },
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({
    invalidateQueries: (...args: unknown[]) => invalidateQueries(...args),
  }),
}));

vi.mock("react-native", () => ({
  Platform: { OS: "ios" },
}));

vi.mock("expo-constants", () => ({
  default: { executionEnvironment: "standalone" },
  ExecutionEnvironment: { StoreClient: "storeClient" },
}));

vi.mock("expo-notifications", () => ({
  setNotificationHandler: (...args: unknown[]) => setNotificationHandler(...args),
  addNotificationReceivedListener: (...args: unknown[]) => addNotificationReceivedListener(...args),
  addNotificationResponseReceivedListener: (...args: unknown[]) =>
    addNotificationResponseReceivedListener(...args),
  getLastNotificationResponseAsync: (...args: unknown[]) =>
    getLastNotificationResponseAsync(...args),
}));

import { usePushResponseHandler } from "./usePushResponseHandler";

function response(identifier: string, data: Record<string, unknown> | undefined) {
  return { notification: { request: { identifier, content: { data } } } };
}

describe("usePushResponseHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    addNotificationReceivedListener.mockReturnValue({ remove: vi.fn() });
    addNotificationResponseReceivedListener.mockReturnValue({ remove: vi.fn() });
    getLastNotificationResponseAsync.mockResolvedValue(null);
  });

  // The response listener only fires while the app is running. A tap that
  // launches a killed app is replayed through getLastNotificationResponseAsync
  // instead, and used to be dropped entirely.
  it("routes a tap that cold-started the app", async () => {
    getLastNotificationResponseAsync.mockResolvedValue(
      response("notif-1", { notificationId: "abc-123" }),
    );

    renderHook(() => usePushResponseHandler(true));

    await waitFor(() => {
      expect(routerPush).toHaveBeenCalledWith({
        pathname: "/alerts/[id]",
        params: { id: "abc-123" },
      });
    });
  });

  it("does not navigate when the app was not launched from a notification", async () => {
    renderHook(() => usePushResponseHandler(true));

    await waitFor(() => {
      expect(addNotificationResponseReceivedListener).toHaveBeenCalled();
    });
    expect(routerPush).not.toHaveBeenCalled();
  });

  it("routes shift-request payloads to the Requests tab", async () => {
    getLastNotificationResponseAsync.mockResolvedValue(
      response("notif-2", { type: "shift_request_approved" }),
    );

    renderHook(() => usePushResponseHandler(true));

    await waitFor(() => {
      expect(routerPush).toHaveBeenCalledWith("/(tabs)/requests");
    });
  });

  it("falls back to the alerts inbox for an unrecognized payload", async () => {
    getLastNotificationResponseAsync.mockResolvedValue(response("notif-3", { type: "mystery" }));

    renderHook(() => usePushResponseHandler(true));

    await waitFor(() => {
      expect(routerPush).toHaveBeenCalledWith("/alerts");
    });
  });

  it("stays inert until the user is signed in", async () => {
    renderHook(() => usePushResponseHandler(false));

    expect(getLastNotificationResponseAsync).not.toHaveBeenCalled();
    expect(addNotificationResponseReceivedListener).not.toHaveBeenCalled();
  });
});
