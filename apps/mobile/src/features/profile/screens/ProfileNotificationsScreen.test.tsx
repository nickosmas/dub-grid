import { fireEvent, render, screen } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createReactNativeModule, createScreenModule } from "../../../test/native";

const useMutation = vi.fn();
const useQuery = vi.fn();
const useQueryClient = vi.fn();
const useAccessToken = vi.fn();
const useBootstrap = vi.fn();
const usePushRegistration = vi.fn();
const pushToast = vi.fn();
const getProfileNotificationPreferences = vi.fn();
const saveProfileNotificationPreferences = vi.fn();

vi.mock("react-native", async () => createReactNativeModule(await import("react")));

vi.mock("@expo/vector-icons/Ionicons", () => ({
  default: () => null,
}));

vi.mock("../../../shared/components/Screen", async () => createScreenModule(await import("react")));

vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-query")>();
  return {
    ...actual,
    useMutation,
    useQuery,
    useQueryClient,
  };
});

vi.mock("../../auth/hooks/useAccessToken", () => ({
  useAccessToken,
}));

vi.mock("../../auth/hooks/useBootstrap", () => ({
  useBootstrap,
}));

vi.mock("../../notifications/hooks/usePushRegistration", () => ({
  usePushRegistration,
}));

vi.mock("../../../shared/lib/api", () => ({
  getProfileNotificationPreferences: (...args: unknown[]) =>
    getProfileNotificationPreferences(...args),
  saveProfileNotificationPreferences: (...args: unknown[]) =>
    saveProfileNotificationPreferences(...args),
}));

vi.mock("../../../shared/providers/ToastProvider", () => ({
  useToast: () => ({ pushToast }),
}));

let ProfileNotificationsScreen: (typeof import("./ProfileNotificationsScreen"))["default"];

beforeAll(async () => {
  ProfileNotificationsScreen = (await import("./ProfileNotificationsScreen")).default;
});

const setQueryData = vi.fn();

function defaultPush(overrides?: Partial<ReturnType<typeof usePushRegistration>>) {
  return {
    permissionState: "granted",
    isRegistering: false,
    isSupported: true,
    enablePush: vi.fn().mockResolvedValue(undefined),
    disablePush: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe("ProfileNotificationsScreen", () => {
  beforeEach(() => {
    useMutation.mockReset();
    useQuery.mockReset();
    useQueryClient.mockReset();
    useAccessToken.mockReset();
    useBootstrap.mockReset();
    usePushRegistration.mockReset();
    pushToast.mockReset();
    getProfileNotificationPreferences.mockReset();
    saveProfileNotificationPreferences.mockReset();
    setQueryData.mockReset();

    useAccessToken.mockReturnValue("token-123");
    useBootstrap.mockReturnValue({ data: { currentOrg: { id: "org-1" } } });
    useQueryClient.mockReturnValue({ setQueryData });
    usePushRegistration.mockReturnValue(defaultPush());
    useMutation.mockReturnValue({ isPending: false, mutate: vi.fn() });
  });

  it("shows a loading skeleton while preferences are loading", async () => {
    useQuery.mockReturnValue({ data: undefined, isLoading: true, error: null, refetch: vi.fn() });

    render(<ProfileNotificationsScreen />);

    expect(screen.queryByTestId("skeleton")).not.toBeInTheDocument();
    expect(await screen.findByTestId("skeleton")).toBeInTheDocument();
  });

  it("shows an error state with retry when preferences fail to load", () => {
    const refetch = vi.fn();
    useQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error("network down"),
      refetch,
    });

    render(<ProfileNotificationsScreen />);

    expect(screen.getByText("Could not load preferences")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Try again"));
    expect(refetch).toHaveBeenCalled();
  });

  it("summarises each category's channels on its row, with the switches behind it", () => {
    useQuery.mockReturnValue({
      data: {
        prefs: {
          schedule: { in_app: true, email: true },
          shift_requests: { in_app: false, email: false },
          system: { in_app: true, email: false },
        },
      },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<ProfileNotificationsScreen />);

    expect(screen.getByText("Schedule updates")).toBeInTheDocument();
    expect(screen.getByText("Shift requests")).toBeInTheDocument();
    expect(screen.getByText("System & account")).toBeInTheDocument();

    // The row says what is on; six switches no longer sit open on the page.
    expect(screen.getByText("In-app, Email")).toBeInTheDocument();
    expect(screen.getByText("Off")).toBeInTheDocument();
    expect(screen.getByText("In-app")).toBeInTheDocument();
    expect(screen.queryByLabelText("In-app notifications")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Email notifications")).not.toBeInTheDocument();
  });

  it("optimistically writes and saves a preference toggled in the category sheet", () => {
    const mutate = vi.fn();
    useMutation.mockReturnValue({ isPending: false, mutate });
    useQuery.mockReturnValue({
      data: {
        prefs: {
          schedule: { in_app: true, email: false },
          shift_requests: { in_app: true, email: false },
          system: { in_app: true, email: false },
        },
      },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<ProfileNotificationsScreen />);

    fireEvent.click(screen.getByRole("button", { name: /^Schedule updates/ }));

    const inAppSwitch = screen.getByLabelText("In-app notifications");
    expect(inAppSwitch).toBeChecked();
    fireEvent.click(inAppSwitch);

    expect(setQueryData).toHaveBeenCalledWith(["mobile", "notification-preferences", "token-123"], {
      prefs: {
        schedule: { in_app: false, email: false },
        shift_requests: { in_app: true, email: false },
        system: { in_app: true, email: false },
      },
    });
    expect(mutate).toHaveBeenCalledWith({
      schedule: { in_app: false, email: false },
      shift_requests: { in_app: true, email: false },
      system: { in_app: true, email: false },
    });
  });

  it("shows permission-denied copy and disables the push switch when permission was denied", () => {
    usePushRegistration.mockReturnValue(defaultPush({ permissionState: "denied" }));
    useQuery.mockReturnValue({
      data: { prefs: {} },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<ProfileNotificationsScreen />);

    expect(
      screen.getByText("Permission was denied. Enable it from your device settings."),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Push notifications")).toBeDisabled();
  });

  it("disables push when the switch is toggled off while granted", async () => {
    const disablePush = vi.fn().mockResolvedValue(undefined);
    usePushRegistration.mockReturnValue(defaultPush({ permissionState: "granted", disablePush }));
    useQuery.mockReturnValue({
      data: { prefs: {} },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<ProfileNotificationsScreen />);

    fireEvent.click(screen.getByLabelText("Push notifications"));

    expect(disablePush).toHaveBeenCalled();
  });
});
