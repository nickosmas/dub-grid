import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createReactNativeModule, createScreenModule } from "../../../test/native";

const useQuery = vi.fn();
const useMutation = vi.fn();
const useAccessToken = vi.fn();
const pushToast = vi.fn();
const openURL = vi.fn();
const share = vi.fn();

vi.mock("react-native", async () => {
  const base = createReactNativeModule(await import("react"));
  return {
    ...base,
    Linking: { openURL: (...args: unknown[]) => openURL(...args) },
    Share: { share: (...args: unknown[]) => share(...args) },
  };
});

vi.mock("@expo/vector-icons/Ionicons", () => ({
  default: () => null,
}));

vi.mock("../../../shared/components/Screen", async () => createScreenModule(await import("react")));

vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-query")>();
  return { ...actual, useMutation, useQuery };
});

vi.mock("../../auth/hooks/useAccessToken", () => ({ useAccessToken }));

vi.mock("../../../shared/lib/api", () => ({
  getCalendarSubscription: vi.fn(),
  createCalendarSubscription: vi.fn(),
  rotateCalendarSubscription: vi.fn(),
  revokeCalendarSubscription: vi.fn(),
}));

vi.mock("../../../shared/lib/env", () => ({
  getMobileEnvConfig: () => ({ apiBaseUrl: "https://app.dubgrid.com" }),
}));

vi.mock("../../../shared/providers/ToastProvider", () => ({
  useToast: () => ({ pushToast }),
}));

const FEED_URL = "https://calmhaven.dubgrid.app/api/calendar/feed/tok_abc";

function mockStatus(active: boolean) {
  useQuery.mockReturnValue({
    data: { active, issuedAt: active ? "2026-09-01T00:00:00.000Z" : null },
    error: null,
    isLoading: false,
    refetch: vi.fn().mockResolvedValue(undefined),
  });
}

/**
 * The screen wires `onSuccess` into `useMutation`; the harness replaces the
 * hook, so `mutate` here runs the mutation function and then that callback,
 * which is what opens the calendar.
 */
function mockMutations() {
  const mutations: Array<{ mutate: ReturnType<typeof vi.fn> }> = [];
  useMutation.mockImplementation((options: any) => {
    const mutate = vi.fn(async (variables: unknown) => {
      const result = await options.mutationFn(variables);
      await options.onSuccess?.(result);
    });
    const entry = { mutate, mutateAsync: mutate, isPending: false };
    mutations.push(entry);
    return entry;
  });
  return mutations;
}

async function renderScreen() {
  const api = await import("../../../shared/lib/api");
  const ProfileCalendarScreen = (await import("./ProfileCalendarScreen")).default;
  render(<ProfileCalendarScreen />);
  return api;
}

describe("ProfileCalendarScreen", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    useQuery.mockReset();
    useMutation.mockReset();
    useAccessToken.mockReset().mockReturnValue("token-123");
    pushToast.mockReset();
    openURL.mockReset().mockResolvedValue(undefined);
    share.mockReset().mockResolvedValue({ action: "sharedAction" });
    mockMutations();
    const api = await import("../../../shared/lib/api");
    vi.mocked(api.createCalendarSubscription).mockResolvedValue({
      active: true,
      issuedAt: "2026-09-01T00:00:00.000Z",
      feedUrl: FEED_URL,
    });
    vi.mocked(api.rotateCalendarSubscription).mockResolvedValue({
      active: true,
      issuedAt: "2026-09-02T00:00:00.000Z",
      feedUrl: `${FEED_URL}-new`,
    });
    vi.mocked(api.revokeCalendarSubscription).mockResolvedValue({ active: false, issuedAt: null });
  });

  it("lists every calendar target on iOS, plus share", async () => {
    mockStatus(false);
    await renderScreen();
    expect(screen.getByRole("button", { name: "Apple Calendar" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Google Calendar" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Outlook" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Share link" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Disable subscription" })).not.toBeInTheDocument();
  });

  it("creates and opens the calendar on first tap without a confirmation", async () => {
    mockStatus(false);
    const api = await renderScreen();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Apple Calendar" }));
    });

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(api.createCalendarSubscription).toHaveBeenCalledWith("token-123");
    expect(api.rotateCalendarSubscription).not.toHaveBeenCalled();
    expect(openURL).toHaveBeenCalledWith(
      "webcals://calmhaven.dubgrid.app/api/calendar/feed/tok_abc",
    );
  });

  it("reuses the issued link for a second tap in the same visit", async () => {
    mockStatus(false);
    const api = await renderScreen();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Google Calendar" }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Outlook" }));
    });

    expect(api.createCalendarSubscription).toHaveBeenCalledTimes(1);
    expect(api.rotateCalendarSubscription).not.toHaveBeenCalled();
    expect(openURL).toHaveBeenCalledTimes(2);
    expect(openURL).toHaveBeenLastCalledWith(
      expect.stringContaining("https://outlook.live.com/calendar/0/addfromweb?url="),
    );
  });

  it("confirms before replacing an existing subscription, and cancel leaves it untouched", async () => {
    mockStatus(true);
    const api = await renderScreen();

    fireEvent.click(screen.getByRole("button", { name: "Google Calendar" }));
    const dialog = screen.getByRole("alert");
    expect(within(dialog).getByText("Replace the existing link?")).toBeInTheDocument();
    expect(api.rotateCalendarSubscription).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(api.rotateCalendarSubscription).not.toHaveBeenCalled();
    expect(openURL).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Google Calendar" }));
    await act(async () => {
      fireEvent.click(within(screen.getByRole("alert")).getByRole("button", { name: "Replace" }));
    });
    expect(api.rotateCalendarSubscription).toHaveBeenCalledWith("token-123");
    expect(api.createCalendarSubscription).not.toHaveBeenCalled();
    expect(openURL).toHaveBeenCalledWith(
      `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(`${FEED_URL}-new`)}`,
    );
  });

  it("shares the link through the system share sheet", async () => {
    mockStatus(false);
    await renderScreen();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Share link" }));
    });
    expect(share).toHaveBeenCalledWith(expect.objectContaining({ url: FEED_URL }));
    expect(openURL).not.toHaveBeenCalled();
  });

  it("disables an active subscription after confirming", async () => {
    mockStatus(true);
    const api = await renderScreen();
    fireEvent.click(screen.getByRole("button", { name: "Disable subscription" }));
    await act(async () => {
      fireEvent.click(within(screen.getByRole("alert")).getByRole("button", { name: "Disable" }));
    });
    expect(api.revokeCalendarSubscription).toHaveBeenCalledWith("token-123");
  });

  it("omits the Apple Calendar row on Android", async () => {
    vi.resetModules();
    vi.doMock("react-native", async () => ({
      ...createReactNativeModule(await import("react"), { platformOS: "android" }),
      Linking: { openURL },
      Share: { share },
    }));
    mockStatus(false);
    await renderScreen();
    expect(screen.queryByRole("button", { name: "Apple Calendar" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Google Calendar" })).toBeInTheDocument();
  });
});
