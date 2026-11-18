import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createReactNativeModule, createSafeAreaContextModule } from "../../test/native";

type NativeSheetProps = {
  enablePanDownToClose?: boolean;
  onClose?: () => void;
  handleComponent?: null;
};

const nativeSheet = vi.hoisted(() => ({ props: null as NativeSheetProps | null }));

vi.mock("@expo/ui/community/bottom-sheet", () => ({
  default: (props: NativeSheetProps & { children: ReactNode }) => {
    nativeSheet.props = props;
    return <div>{props.children}</div>;
  },
  BottomSheetView: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  BottomSheetScrollView: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock("react-native-safe-area-context", async () =>
  createSafeAreaContextModule(await import("react")),
);
vi.mock("@expo/vector-icons/Ionicons", () => ({ default: () => null }));

/** The native sheet, loaded fresh for one platform: it reads `Platform.OS` once. */
async function loadSheet(platformOS: "ios" | "android") {
  vi.resetModules();
  vi.doMock("react-native", async () =>
    createReactNativeModule(await import("react"), { platformOS }),
  );
  return import("./BottomSheetModal.native");
}

beforeEach(() => {
  nativeSheet.props = null;
});

describe("BottomSheetModal (native) with unsaved changes", () => {
  it("lets a clean sheet be swiped, tapped or backed away", async () => {
    const { BottomSheetModal, SheetHeader } = await loadSheet("ios");
    render(
      <BottomSheetModal header={<SheetHeader title="Permissions" />} visible onDismiss={vi.fn()}>
        <span>Body</span>
      </BottomSheetModal>,
    );

    expect(nativeSheet.props?.enablePanDownToClose).toBe(true);
  });

  it("turns off the swipe, scrim and back while it holds unsaved changes", async () => {
    // Otherwise the native sheet closes before the guard can refuse, and Keep
    // editing leaves `visible` true with no sheet on screen.
    const { BottomSheetModal, SheetHeader } = await loadSheet("ios");
    const onDismiss = vi.fn();
    render(
      <BottomSheetModal
        hasUnsavedChanges
        header={<SheetHeader title="Permissions" />}
        visible
        onDismiss={onDismiss}
      >
        <span>Body</span>
      </BottomSheetModal>,
    );

    expect(nativeSheet.props?.enablePanDownToClose).toBe(false);
    // The close button still asks, through the same funnel.
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("keeps them off while a save is in flight", async () => {
    const { BottomSheetModal } = await loadSheet("ios");
    render(
      <BottomSheetModal dismissDisabled visible onDismiss={vi.fn()}>
        <span>Body</span>
      </BottomSheetModal>,
    );

    expect(nativeSheet.props?.enablePanDownToClose).toBe(false);
  });

  it("gives Android a close button only while the gestures are off", async () => {
    // Material sheets have no close button: the swipe, the scrim and Back
    // close them. With those off, the sheet still needs a way out that asks.
    const { BottomSheetModal, SheetHeader } = await loadSheet("android");
    const onDismiss = vi.fn();
    const sheet = (dirty: boolean) => (
      <BottomSheetModal
        hasUnsavedChanges={dirty}
        header={<SheetHeader title="Permissions" />}
        visible
        onDismiss={onDismiss}
      >
        <span>Body</span>
      </BottomSheetModal>
    );
    const view = render(sheet(false));
    expect(screen.queryByRole("button", { name: "Close" })).not.toBeInTheDocument();

    view.rerender(sheet(true));
    expect(nativeSheet.props?.enablePanDownToClose).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("reports only a dismissal the person made, not one the caller made by hiding it", async () => {
    const { BottomSheetModal } = await loadSheet("ios");
    const onDismiss = vi.fn();
    const view = render(
      <BottomSheetModal visible onDismiss={onDismiss}>
        <span>Body</span>
      </BottomSheetModal>,
    );

    view.rerender(
      <BottomSheetModal visible={false} onDismiss={onDismiss}>
        <span>Body</span>
      </BottomSheetModal>,
    );
    nativeSheet.props?.onClose?.();
    expect(onDismiss).not.toHaveBeenCalled();
  });
});

describe("BottomSheetModal (native) as a gate", () => {
  async function renderGate(platformOS: "ios" | "android") {
    const sheet = await loadSheet(platformOS);
    const { SheetActions } = await import("./BottomSheetModalDrawn");
    const { Button } = await import("./Button");
    const onAccept = vi.fn();
    render(
      <sheet.BottomSheetModal
        dismissDisabled
        footer={
          <SheetActions primaryAction={<Button label="Accept all" onPress={onAccept} />}>
            <Button label="Essential only" onPress={vi.fn()} tone="secondary" />
          </SheetActions>
        }
        header={<sheet.SheetHeader title="Your privacy" />}
        presentationKind="gate"
        visible
        onDismiss={vi.fn()}
      >
        <span>Body</span>
      </sheet.BottomSheetModal>,
    );
    return { onAccept };
  }

  it("is the native sheet on iOS, with no grabber, swipe or close button", async () => {
    const { onAccept } = await renderGate("ios");

    expect(nativeSheet.props).not.toBeNull();
    expect(nativeSheet.props?.handleComponent).toBeNull();
    expect(nativeSheet.props?.enablePanDownToClose).toBe(false);
    expect(screen.queryByRole("button", { name: "Close" })).toBeNull();
    // Its answers stay at its foot rather than moving into the bar.
    expect(screen.getByRole("button", { name: "Essential only" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Accept all" }));
    expect(onAccept).toHaveBeenCalledTimes(1);
  });

  it("stays the drawn sheet on Android", async () => {
    await renderGate("android");

    expect(nativeSheet.props).toBeNull();
    expect(screen.getByRole("button", { name: "Accept all" })).toBeTruthy();
  });
});
