import { render } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createReactNativeModule, createSafeAreaContextModule } from "../../test/native";
import { resetSheetPresentationTracking } from "../lib/modal-presentation";

vi.mock("react-native", async () => createReactNativeModule(await import("react")));

vi.mock("react-native-safe-area-context", async () =>
  createSafeAreaContextModule(await import("react")),
);

let BottomSheetModal: (typeof import("./BottomSheetModal"))["BottomSheetModal"];

beforeAll(async () => {
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

  it("allows a confirmation over the sheet it guards", () => {
    expect(() => render(<Sheets visible={[true, true]} />)).not.toThrow();
  });

  it("fails the render when a third sheet joins them", () => {
    expect(() => render(<Sheets visible={[true, true, true]} />)).toThrow(/past the limit of 2/);
  });

  it("ignores sheets that are mounted but not visible", () => {
    expect(() => render(<Sheets visible={[true, false, false, false]} />)).not.toThrow();
  });

  it("frees the slot when a sheet closes", () => {
    const view = render(<Sheets visible={[true, true]} />);

    expect(() => view.rerender(<Sheets visible={[true, false]} />)).not.toThrow();
    expect(() => view.rerender(<Sheets visible={[true, false, true]} />)).not.toThrow();
  });
});
