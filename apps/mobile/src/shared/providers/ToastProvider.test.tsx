import { fireEvent, render, screen } from "@testing-library/react";
import { act } from "react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createReactNativeModule, createSafeAreaContextModule } from "../../test/native";

vi.useFakeTimers();

vi.mock("react-native", async () => createReactNativeModule(await import("react")));

vi.mock("react-native-safe-area-context", async () =>
  createSafeAreaContextModule(await import("react")),
);

vi.mock("@expo/vector-icons/Ionicons", () => ({
  default: () => null,
}));

const useNetworkStatus = vi.fn();

vi.mock("./NetworkStateProvider", () => ({
  useNetworkStatus,
}));

let ToastProvider: (typeof import("./ToastProvider"))["ToastProvider"];
let useToast: (typeof import("./ToastProvider"))["useToast"];

beforeAll(async () => {
  const module = await import("./ToastProvider");
  ToastProvider = module.ToastProvider;
  useToast = module.useToast;
});

function ToastHarness() {
  const { pushToast } = useToast();

  return (
    <>
      <button
        onClick={() => {
          pushToast({
            tone: "error",
            title: "First toast",
            message: "First message",
            durationMs: 1000,
          });
        }}
        type="button"
      >
        Queue first
      </button>
      <button
        onClick={() => {
          pushToast({
            tone: "info",
            title: "Second toast",
            message: "Second message",
            durationMs: 1000,
          });
        }}
        type="button"
      >
        Queue second
      </button>
      <button
        onClick={() => {
          pushToast({
            tone: "error",
            title: "Network connection issue",
            message: "Check your internet connection and try again.",
            dedupeKey: "network-connection-error",
          });
        }}
        type="button"
      >
        Queue network
      </button>
    </>
  );
}

describe("ToastProvider", () => {
  beforeEach(() => {
    vi.clearAllTimers();
    useNetworkStatus.mockReturnValue({
      hasResolvedState: true,
      isOnline: true,
      isOffline: false,
    });
  });

  it("queues toasts, auto-dismisses, and allows swipe dismiss", () => {
    render(
      <ToastProvider>
        <ToastHarness />
      </ToastProvider>,
    );

    fireEvent.click(screen.getByText("Queue first"));
    fireEvent.click(screen.getByText("Queue second"));

    expect(screen.getByText("First toast")).toBeInTheDocument();
    expect(screen.queryByText("Second toast")).not.toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(screen.getByText("Second toast")).toBeInTheDocument();

    const toast = screen.getByTestId("toast-notification");
    fireEvent.touchStart(toast, {
      changedTouches: [{ pageY: 120 }],
      touches: [{ pageY: 120 }],
    });
    fireEvent.touchEnd(toast, {
      changedTouches: [{ pageY: 72 }],
    });

    expect(screen.queryByText("Second toast")).not.toBeInTheDocument();
  });

  it("coalesces duplicate network toasts and auto-dismisses after the default duration", () => {
    render(
      <ToastProvider>
        <ToastHarness />
      </ToastProvider>,
    );

    fireEvent.click(screen.getByText("Queue network"));
    fireEvent.click(screen.getByText("Queue network"));

    expect(screen.getByText("Network connection issue")).toBeInTheDocument();
    expect(screen.getAllByText("Network connection issue")).toHaveLength(1);

    act(() => {
      vi.advanceTimersByTime(4000);
    });

    expect(screen.getByText("Network connection issue")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(screen.queryByText("Network connection issue")).not.toBeInTheDocument();
  });

  it("allows an upward swipe to dismiss a network toast early", () => {
    render(
      <ToastProvider>
        <ToastHarness />
      </ToastProvider>,
    );

    fireEvent.click(screen.getByText("Queue network"));
    expect(screen.getByText("Network connection issue")).toBeInTheDocument();

    const toast = screen.getByTestId("toast-notification");
    fireEvent.touchStart(toast, {
      changedTouches: [{ pageY: 120 }],
      touches: [{ pageY: 120 }],
    });
    fireEvent.touchEnd(toast, {
      changedTouches: [{ pageY: 72 }],
    });

    expect(screen.queryByText("Network connection issue")).not.toBeInTheDocument();
  });

  it("hides the offline banner via an upward swipe until offline is re-entered", () => {
    useNetworkStatus.mockReturnValue({
      hasResolvedState: true,
      isOnline: false,
      isOffline: true,
    });

    const { rerender } = render(
      <ToastProvider>
        <ToastHarness />
      </ToastProvider>,
    );

    expect(screen.getByText("Network connection issue")).toBeInTheDocument();

    const banner = screen.getByTestId("offline-toast");
    fireEvent.touchStart(banner, {
      changedTouches: [{ pageY: 120 }],
      touches: [{ pageY: 120 }],
    });
    fireEvent.touchEnd(banner, {
      changedTouches: [{ pageY: 72 }],
    });

    expect(screen.queryByText("Network connection issue")).not.toBeInTheDocument();

    // Still offline — the dismissal should hold, not reappear on its own.
    rerender(
      <ToastProvider>
        <ToastHarness />
      </ToastProvider>,
    );
    expect(screen.queryByText("Network connection issue")).not.toBeInTheDocument();

    useNetworkStatus.mockReturnValue({
      hasResolvedState: true,
      isOnline: true,
      isOffline: false,
    });
    rerender(
      <ToastProvider>
        <ToastHarness />
      </ToastProvider>,
    );

    useNetworkStatus.mockReturnValue({
      hasResolvedState: true,
      isOnline: false,
      isOffline: true,
    });
    rerender(
      <ToastProvider>
        <ToastHarness />
      </ToastProvider>,
    );

    expect(screen.getByText("Network connection issue")).toBeInTheDocument();
  });

  it("auto-dismisses the offline banner after the default duration", () => {
    useNetworkStatus.mockReturnValue({
      hasResolvedState: true,
      isOnline: false,
      isOffline: true,
    });

    render(
      <ToastProvider>
        <ToastHarness />
      </ToastProvider>,
    );

    expect(screen.getByText("Network connection issue")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(4000);
    });

    expect(screen.getByText("Network connection issue")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(screen.queryByText("Network connection issue")).not.toBeInTheDocument();
  });

  it("renders the dedicated offline toast from network state", () => {
    useNetworkStatus.mockReturnValue({
      hasResolvedState: true,
      isOnline: false,
      isOffline: true,
    });

    render(
      <ToastProvider>
        <ToastHarness />
      </ToastProvider>,
    );

    expect(screen.getByText("Network connection issue")).toBeInTheDocument();
    expect(screen.getByText("Check your internet connection and try again.")).toBeInTheDocument();
  });

  it("suppresses queued network toasts while the offline toast is visible", () => {
    useNetworkStatus.mockReturnValue({
      hasResolvedState: true,
      isOnline: false,
      isOffline: true,
    });
    render(
      <ToastProvider>
        <ToastHarness />
      </ToastProvider>,
    );

    fireEvent.click(screen.getByText("Queue network"));
    expect(screen.getByText("Network connection issue")).toBeInTheDocument();
    expect(screen.getAllByText("Network connection issue")).toHaveLength(1);
  });

  it("brings the offline banner back when an action fails later in an offline session", () => {
    useNetworkStatus.mockReturnValue({
      hasResolvedState: true,
      isOnline: false,
      isOffline: true,
    });

    render(
      <ToastProvider>
        <ToastHarness />
      </ToastProvider>,
    );

    // The banner has its say, then gets out of the way.
    act(() => {
      vi.advanceTimersByTime(4500);
    });
    expect(screen.queryByText("Network connection issue")).not.toBeInTheDocument();

    // Some minutes later the user taps something that needs the network. That
    // used to produce no feedback whatsoever.
    fireEvent.click(screen.getByText("Queue network"));

    expect(screen.getByText("Network connection issue")).toBeInTheDocument();
    // Still exactly one: re-asserting the banner, not stacking a toast behind it.
    expect(screen.getAllByText("Network connection issue")).toHaveLength(1);
  });

  it("clears transient toasts when the app goes offline so they do not resurface later", () => {
    const { rerender } = render(
      <ToastProvider>
        <ToastHarness />
      </ToastProvider>,
    );

    fireEvent.click(screen.getByText("Queue first"));
    fireEvent.click(screen.getByText("Queue second"));

    expect(screen.getByText("First toast")).toBeInTheDocument();

    useNetworkStatus.mockReturnValue({
      hasResolvedState: true,
      isOnline: false,
      isOffline: true,
    });

    rerender(
      <ToastProvider>
        <ToastHarness />
      </ToastProvider>,
    );

    expect(screen.queryByText("First toast")).not.toBeInTheDocument();
    expect(screen.queryByText("Second toast")).not.toBeInTheDocument();
    expect(screen.getByText("Network connection issue")).toBeInTheDocument();

    useNetworkStatus.mockReturnValue({
      hasResolvedState: true,
      isOnline: true,
      isOffline: false,
    });

    rerender(
      <ToastProvider>
        <ToastHarness />
      </ToastProvider>,
    );

    expect(screen.queryByText("First toast")).not.toBeInTheDocument();
    expect(screen.queryByText("Second toast")).not.toBeInTheDocument();
    expect(screen.queryByText("Network connection issue")).not.toBeInTheDocument();
  });
});
