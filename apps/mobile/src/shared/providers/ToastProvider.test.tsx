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
            durationMs: null,
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

  it("keeps persistent network toasts visible until they are dismissed", () => {
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
      vi.advanceTimersByTime(10_000);
    });

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
