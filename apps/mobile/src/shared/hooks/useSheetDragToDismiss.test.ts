import { act, renderHook } from "@testing-library/react";
import { vi } from "vitest";
import { capturedPanGestures } from "../../test/gesture-handler-stub";
import { useSheetDragToDismiss } from "./useSheetDragToDismiss";

const WINDOW_HEIGHT = 844;

function renderSheetDrag(
  options: { scrollable?: boolean; dismissible?: boolean; visible?: boolean } = {},
) {
  const onDismiss = vi.fn();
  let props = { visible: options.visible ?? true };
  const view = renderHook(
    (next: { visible: boolean }) =>
      useSheetDragToDismiss({
        dismissible: options.dismissible ?? true,
        onDismiss,
        scrollable: options.scrollable ?? false,
        travel: WINDOW_HEIGHT,
        visible: next.visible,
      }),
    { initialProps: props },
  );
  const gesture = capturedPanGestures.at(-1);

  function setVisible(visible: boolean) {
    props = { visible };
    act(() => view.rerender(props));
  }

  function translateY() {
    // The animated style is built during render, so a value the position effect
    // wrote after that render only surfaces on the next one. Flush a render so
    // the assertion reads where the sheet actually settled.
    act(() => view.rerender(props));
    const [transform] = (
      view.result.current.sheetStyle as { transform: Array<{ translateY: number }> }
    ).transform;
    return transform.translateY;
  }

  // Mid-drag, with no release: what the sheet does while the finger is down.
  function dragTo(to: number) {
    act(() => {
      gesture?.__handlers.onUpdate?.({ translationY: to });
    });
  }

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

  /** What the ScrollView reports on mount: how much content, and how much of it fits. */
  function measureList({ content, viewport }: { content: number; viewport: number }) {
    act(() => {
      view.result.current.onScrollContentSizeChange(0, content);
      view.result.current.onScrollViewLayout({
        nativeEvent: { layout: { height: viewport } },
      } as Parameters<typeof view.result.current.onScrollViewLayout>[0]);
    });
  }

  return { drag, dragTo, gesture, measureList, onDismiss, scrollTo, setVisible, translateY, view };
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

  it("settles a dragged sheet back when the caller keeps it open", () => {
    // What a dirty form does: intercept the dismissal to confirm first. The
    // sheet has already animated off-screen by then, so if it didn't come back
    // it would stay mounted and invisible with no way to reach it again.
    const { drag, onDismiss, translateY } = renderSheetDrag();

    drag({ to: 140 });

    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(translateY()).toBe(0);
  });

  it("leaves a dragged sheet closed when the caller accepts the dismissal", () => {
    const { drag, setVisible, translateY } = renderSheetDrag();

    drag({ to: 140 });
    setVisible(false);

    expect(translateY()).toBe(WINDOW_HEIGHT);
  });

  it("moves a sheet that refuses to close, then settles it back", () => {
    const { drag, dragTo, onDismiss, translateY } = renderSheetDrag({ dismissible: false });

    dragTo(400);
    const held = translateY();

    // Far enough to dismiss a normal sheet, so the resistance is the only thing
    // keeping it open — and it has to have moved, or the drag reads as dead.
    expect(held).toBeGreaterThan(0);
    expect(held).toBeLessThanOrEqual(32);

    drag({ to: 400, velocity: 2000 });

    expect(onDismiss).not.toHaveBeenCalled();
    expect(translateY()).toBe(0);
  });

  it("resists an upward drag in the other direction and settles back", () => {
    const { drag, dragTo, onDismiss, translateY } = renderSheetDrag();

    dragTo(-400);
    const lifted = translateY();

    expect(lifted).toBeLessThan(0);
    expect(lifted).toBeGreaterThanOrEqual(-32);

    drag({ to: -400 });

    expect(onDismiss).not.toHaveBeenCalled();
    expect(translateY()).toBe(0);
  });

  it("takes the drag in both directions, list or no list", () => {
    // Nothing fails the gesture by direction any more: which of the sheet and
    // the list moves is decided per frame from how much scrolling is left.
    for (const view of [renderSheetDrag(), renderSheetDrag({ scrollable: true })]) {
      expect(view.gesture?.__config.activeOffsetY).toEqual([[-8, 8]]);
      expect(view.gesture?.__config.failOffsetY).toBeUndefined();
    }
  });

  it("leaves an upward drag to the list while it still has content below", () => {
    const { dragTo, measureList, translateY } = renderSheetDrag({ scrollable: true });

    measureList({ content: 2000, viewport: 600 });
    dragTo(-200);

    expect(translateY()).toBe(0);
  });

  it("stretches upward once the list has nothing left to scroll", () => {
    const { drag, dragTo, measureList, scrollTo, translateY } = renderSheetDrag({
      scrollable: true,
    });

    measureList({ content: 2000, viewport: 600 });
    scrollTo(1400);
    dragTo(-200);
    const lifted = translateY();

    expect(lifted).toBeLessThan(0);
    expect(lifted).toBeGreaterThanOrEqual(-32);

    drag({ to: -200 });

    expect(translateY()).toBe(0);
  });

  it("stretches upward on a scrollable sheet whose content never fills it", () => {
    // The case with no scroll event to learn from: a short `scrollable` sheet
    // (most confirmations) must still answer an upward drag.
    const { dragTo, measureList, translateY } = renderSheetDrag({ scrollable: true });

    measureList({ content: 400, viewport: 600 });
    dragTo(-200);

    expect(translateY()).toBeLessThan(0);
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
