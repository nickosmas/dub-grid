import { act, renderHook } from "@testing-library/react";
import { vi } from "vitest";
import { capturedPanGestures } from "../../test/gesture-handler-stub";
import { useSheetDragToDismiss } from "./useSheetDragToDismiss";

const WINDOW_HEIGHT = 844;

function renderSheetDrag(options: { scrollable?: boolean; enabled?: boolean } = {}) {
  const onDismiss = vi.fn();
  const view = renderHook(() =>
    useSheetDragToDismiss({
      enabled: options.enabled ?? true,
      onDismiss,
      scrollable: options.scrollable ?? false,
      travel: WINDOW_HEIGHT,
      visible: true,
    }),
  );
  const gesture = capturedPanGestures.at(-1);

  function drag({ to, velocity = 0 }: { to: number; velocity?: number }) {
    act(() => {
      gesture?.__handlers.onUpdate?.({ translationY: to });
      gesture?.__handlers.onEnd?.({ translationY: to, velocityY: velocity });
      gesture?.__handlers.onFinalize?.({});
    });
  }

  function scrollTo(offset: number) {
    act(() => {
      (view.result.current.scrollHandler as (event: unknown) => void)({
        contentOffset: { y: offset },
      });
    });
  }

  return { drag, onDismiss, scrollTo, view };
}

describe("useSheetDragToDismiss", () => {
  it("closes the sheet after a long drag", () => {
    const { drag, onDismiss } = renderSheetDrag();

    drag({ to: 140 });

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("closes on a quick flick, even a short one", () => {
    const { drag, onDismiss } = renderSheetDrag();

    drag({ to: 30, velocity: 1400 });

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("snaps back after a short, slow drag", () => {
    const { drag, onDismiss } = renderSheetDrag();

    drag({ to: 30 });

    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("leaves the drag to the list while a scrollable sheet still has room to scroll", () => {
    const { drag, onDismiss, scrollTo } = renderSheetDrag({ scrollable: true });

    scrollTo(240);
    drag({ to: 200 });

    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("measures the drag from where the list reached its top, not from the touch", () => {
    const { drag, onDismiss, scrollTo } = renderSheetDrag({ scrollable: true });
    const gesture = capturedPanGestures.at(-1);

    // Scrolled to the top mid-gesture: the 300px already spent scrolling must
    // not count toward the dismiss threshold.
    scrollTo(300);
    act(() => {
      gesture?.__handlers.onUpdate?.({ translationY: 300 });
    });
    scrollTo(0);
    drag({ to: 340 });

    expect(onDismiss).not.toHaveBeenCalled();
  });
});
