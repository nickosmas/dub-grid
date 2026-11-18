import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { createReactNativeModule, createScreenModule } from "../../../test/native";

const getProfileNotificationPreferences = vi.fn();
const saveProfileNotificationPreferences = vi.fn();

vi.mock("react-native", async () => createReactNativeModule(await import("react")));
vi.mock("@expo/vector-icons/Ionicons", () => ({ default: () => null }));
vi.mock("../../../shared/components/Screen", async () => createScreenModule(await import("react")));
vi.mock("../../auth/hooks/useAccessToken", () => ({ useAccessToken: () => "token-123" }));
vi.mock("../../auth/hooks/useBootstrap", () => ({
  useBootstrap: () => ({ data: { currentOrg: { id: "org-1" } } }),
}));
vi.mock("../../notifications/hooks/usePushRegistration", () => ({
  usePushRegistration: () => ({
    permissionState: "granted",
    isEnabled: true,
    isRegistering: false,
    isSupported: true,
    enablePush: vi.fn(),
    disablePush: vi.fn(),
  }),
}));
vi.mock("../../../shared/lib/api", () => ({
  getProfileNotificationPreferences: (...args: unknown[]) =>
    getProfileNotificationPreferences(...args),
  saveProfileNotificationPreferences: (...args: unknown[]) =>
    saveProfileNotificationPreferences(...args),
}));
vi.mock("../../../shared/providers/ToastProvider", () => ({
  useToast: () => ({ pushToast: vi.fn() }),
}));

let ProfileNotificationsScreen: (typeof import("./ProfileNotificationsScreen"))["default"];

beforeAll(async () => {
  ProfileNotificationsScreen = (await import("./ProfileNotificationsScreen")).default;
});

const prefs = (schedule: { in_app: boolean; email: boolean }) => ({
  schedule,
  shift_requests: { in_app: true, email: false },
  system: { in_app: true, email: false },
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("ProfileNotificationsScreen saves", () => {
  it("keeps a second quick toggle when the first save's reply comes back", async () => {
    getProfileNotificationPreferences.mockResolvedValue({
      prefs: prefs({ in_app: true, email: false }),
    });
    const firstSave = deferred<unknown>();
    const secondSave = deferred<unknown>();
    saveProfileNotificationPreferences
      .mockReturnValueOnce(firstSave.promise)
      .mockReturnValueOnce(secondSave.promise);

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <ProfileNotificationsScreen />
      </QueryClientProvider>,
    );

    fireEvent.click(await screen.findByRole("button", { name: /^Schedule updates/ }));
    fireEvent.click(screen.getByLabelText("In-app notifications"));
    fireEvent.click(screen.getByLabelText("Email notifications"));

    // The second save waits for the first, so the server ends on the last toggle.
    await waitFor(() => expect(saveProfileNotificationPreferences).toHaveBeenCalledTimes(1));

    await act(async () => {
      firstSave.resolve({ prefs: prefs({ in_app: false, email: false }) });
    });

    expect(screen.getByLabelText("In-app notifications")).not.toBeChecked();
    expect(screen.getByLabelText("Email notifications")).toBeChecked();
    await waitFor(() => expect(saveProfileNotificationPreferences).toHaveBeenCalledTimes(2));
    expect(saveProfileNotificationPreferences).toHaveBeenLastCalledWith(
      "token-123",
      prefs({ in_app: false, email: true }),
    );

    // A refetch that lands while the last save is pending keeps the toggles.
    await act(async () => {
      await queryClient.refetchQueries();
    });
    expect(screen.getByLabelText("Email notifications")).toBeChecked();

    await act(async () => {
      secondSave.resolve({ prefs: prefs({ in_app: false, email: true }) });
    });
    expect(screen.getByLabelText("In-app notifications")).not.toBeChecked();
    expect(screen.getByLabelText("Email notifications")).toBeChecked();
  });
});
