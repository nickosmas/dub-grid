import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createReactNativeModule, createSafeAreaContextModule } from "../../test/native";
import { setAppLockSurface } from "../lib/app-lock";
import { resetSheetPresentationTracking } from "../lib/modal-presentation";

vi.mock("react-native", async () => createReactNativeModule(await import("react")));

vi.mock("react-native-safe-area-context", async () =>
  createSafeAreaContextModule(await import("react")),
);

let BottomSheetModal: (typeof import("./BottomSheetModal"))["BottomSheetModal"];
let FullPageSheet: (typeof import("./FullPageSheet"))["FullPageSheet"];
let ConfirmationModal: (typeof import("./ConfirmationModal"))["ConfirmationModal"];

beforeAll(async () => {
  BottomSheetModal = (await import("./BottomSheetModal")).BottomSheetModal;
  FullPageSheet = (await import("./FullPageSheet")).FullPageSheet;
  ConfirmationModal = (await import("./ConfirmationModal")).ConfirmationModal;
});

const signOut = vi.fn();

function engageLock(failed: boolean) {
  act(() => setAppLockSurface({ engaged: true, failed, retrying: false, retry: vi.fn(), signOut }));
}

afterEach(() => {
  act(() => setAppLockSurface(null));
  resetSheetPresentationTracking();
});

// Each is a native window above the app, where the lock page cannot reach.
// Nothing is closed: the sheet stays presented, its content stays mounted,
// and the lock is drawn over it inside its own window.
function expectCoveredWhileLocked(text: string, onDismiss?: ReturnType<typeof vi.fn>) {
  expect(screen.queryByTestId("app-lock-overlay")).not.toBeInTheDocument();

  engageLock(false);
  expect(screen.getByTestId("app-lock-overlay")).toBeInTheDocument();
  expect(screen.getByText(text)).toBeInTheDocument();

  engageLock(true);
  fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
  expect(signOut).toHaveBeenCalled();
  if (onDismiss) {
    fireEvent.click(screen.getAllByRole("button", { name: /close|cancel/i })[0]);
    expect(onDismiss).not.toHaveBeenCalled();
  }

  act(() => setAppLockSurface(null));
  expect(screen.queryByTestId("app-lock-overlay")).not.toBeInTheDocument();
  expect(screen.getByText(text)).toBeInTheDocument();
}

describe("sheets under the app lock", () => {
  it("draws the lock inside an open bottom sheet without closing it", () => {
    const onDismiss = vi.fn();
    render(
      <BottomSheetModal visible onDismiss={onDismiss}>
        <div>bottom sheet</div>
      </BottomSheetModal>,
    );
    expectCoveredWhileLocked("bottom sheet", onDismiss);
  });

  it("draws the lock inside an open full-page sheet without closing it", () => {
    const onDismiss = vi.fn();
    render(
      <FullPageSheet title="Task" visible onDismiss={onDismiss}>
        <div>full page sheet</div>
      </FullPageSheet>,
    );
    expectCoveredWhileLocked("full page sheet", onDismiss);
  });

  it("draws the lock inside an open confirmation without closing it", () => {
    const onCancel = vi.fn();
    render(
      <ConfirmationModal
        visible
        title="Discard edits?"
        confirmLabel="Discard"
        onCancel={onCancel}
        onConfirm={() => undefined}
      />,
    );
    expectCoveredWhileLocked("Discard edits?", onCancel);
  });
});
