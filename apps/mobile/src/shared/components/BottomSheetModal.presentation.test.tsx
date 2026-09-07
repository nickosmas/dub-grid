import { render } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createReactNativeModule, createSafeAreaContextModule } from "../../test/native";
import { resetSheetPresentationTracking } from "../lib/modal-presentation";

vi.mock("react-native", async () => createReactNativeModule(await import("react")));

vi.mock("react-native-safe-area-context", async () =>
  createSafeAreaContextModule(await import("react")),
);

let ConfirmationModal: (typeof import("./ConfirmationModal"))["ConfirmationModal"];
let BottomSheetModal: (typeof import("./BottomSheetModal"))["BottomSheetModal"];

beforeAll(async () => {
  ConfirmationModal = (await import("./ConfirmationModal")).ConfirmationModal;
  BottomSheetModal = (await import("./BottomSheetModal")).BottomSheetModal;
});

function Sheets({ visible }: { visible: boolean[] }) {
  return (
    <>
      {visible.map((isVisible, index) => (
        <BottomSheetModal
          debugName={`Sheet ${index + 1}`}
          key={index}
          visible={isVisible}
          onDismiss={() => undefined}
        >
          {null}
        </BottomSheetModal>
      ))}
    </>
  );
}

/**
 * Proves the counter is actually wired to the component, not just correct on its
 * own: the whole point is that an ordinary screen test fails when a screen grows
 * a third sheet, without that screen's author having opted in to anything.
 */
describe("BottomSheetModal stacking guard", () => {
  beforeEach(() => {
    resetSheetPresentationTracking();
  });

  it("allows a real confirmation over its task sheet", () => {
    expect(() =>
      render(
        <>
          <Sheets visible={[true]} />
          <ConfirmationModal
            visible
            title="Discard edits?"
            confirmLabel="Discard"
            onCancel={() => {}}
            onConfirm={() => {}}
          />
        </>,
      ),
    ).not.toThrow();
  });

  it("rejects two task sheets", () => {
    expect(() => render(<Sheets visible={[true, true]} />)).toThrow(/Only one sheet/);
  });

  it("rejects two real confirmations", () => {
    expect(() =>
      render(
        <>
          <ConfirmationModal
            visible
            title="First?"
            confirmLabel="Confirm"
            onCancel={() => {}}
            onConfirm={() => {}}
          />
          <ConfirmationModal
            visible
            title="Second?"
            confirmLabel="Confirm"
            onCancel={() => {}}
            onConfirm={() => {}}
          />
        </>,
      ),
    ).toThrow(/Only one confirmation/);
  });

  it("ignores mounted but hidden sheets and frees the slot on handoff", () => {
    const view = render(<Sheets visible={[true, false, false]} />);
    expect(() => view.rerender(<Sheets visible={[false, true, false]} />)).not.toThrow();
  });
});
