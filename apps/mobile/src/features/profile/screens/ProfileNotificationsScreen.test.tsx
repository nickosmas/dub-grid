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

  it("shows a loading skeleton while preferences are loading", () => {
    useQuery.mockReturnValue({ data: undefined, isLoading: true, error: null, refetch: vi.fn() });

    render(<ProfileNotificationsScreen />);

    expect(screen.getByTestId("detail-skeleton")).toBeInTheDocument();
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

  it("renders category toggles reflecting the loaded preferences", () => {
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
    expect(screen.getAllByText("In-app")).toHaveLength(3);
    expect(screen.getAllByText("Email")).toHaveLength(3);
  });

  it("optimistically writes and saves a toggled category preference", () => {
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

    const [firstInAppToggle] = screen.getAllByText("In-app");
    fireEvent.click(firstInAppToggle);

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
