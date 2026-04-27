import { afterEach, describe, expect, it } from "vitest";

import {
  getElementCornerAlign,
  getElementCornerPlacement,
} from "@/hooks/useAnchoredPopup";

const originalInnerWidth = window.innerWidth;

function makeAnchor(left: number, width = 28): HTMLDivElement {
  const anchor = document.createElement("div");
  Object.defineProperty(anchor, "getBoundingClientRect", {
    value: () =>
      ({
        x: left,
        y: 120,
        top: 120,
        left,
        bottom: 148,
        right: left + width,
        width,
        height: 28,
        toJSON: () => ({}),
      }) as DOMRect,
  });
  return anchor;
}

afterEach(() => {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: originalInnerWidth,
    writable: true,
  });
});

function getCornerPoint(
  placement: ReturnType<typeof getElementCornerPlacement>,
  anchor: HTMLDivElement,
) {
  const rect = anchor.getBoundingClientRect();
  return {
    rect,
    centerX: rect.left + rect.width / 2,
    centerY: rect.top + rect.height / 2,
    cornerX:
      placement.align === "start"
        ? rect.left + placement.alignOffset
        : rect.right - placement.alignOffset,
    cornerY: rect.bottom + placement.sideOffset,
  };
}

describe("useAnchoredPopup", () => {
  it("keeps the popup facing right when there is enough space to the right of the cell", () => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 1200,
      writable: true,
    });

    const align = getElementCornerAlign(makeAnchor(420), {
      popupWidth: 560,
    });

    expect(align).toBe("start");
  });

  it("places the start corner inside the cell and lines it up toward the cell center", () => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 1200,
      writable: true,
    });

    const anchor = makeAnchor(420);
    const placement = getElementCornerPlacement(anchor, {
      popupWidth: 560,
    });
    const { rect, centerX, centerY, cornerX, cornerY } = getCornerPoint(
      placement,
      anchor,
    );

    expect(placement.align).toBe("start");
    expect(cornerX).toBeGreaterThan(rect.left);
    expect(cornerX).toBeLessThan(rect.right);
    expect(cornerY).toBeGreaterThan(rect.top);
    expect(cornerY).toBeLessThan(rect.bottom);
    expect(cornerX).toBeGreaterThan(centerX);
    expect(Math.abs(cornerX - centerX)).toBeCloseTo(
      Math.abs(cornerY - centerY),
      5,
    );
  });

  it("switches to the right corner only when there is not enough room to face right", () => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 900,
      writable: true,
    });

    const align = getElementCornerAlign(makeAnchor(420), {
      popupWidth: 560,
    });

    expect(align).toBe("end");
  });

  it("places the end corner inside the cell and lines it up toward the cell center", () => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 900,
      writable: true,
    });

    const anchor = makeAnchor(420);
    const placement = getElementCornerPlacement(anchor, {
      popupWidth: 560,
    });
    const { rect, centerX, centerY, cornerX, cornerY } = getCornerPoint(
      placement,
      anchor,
    );

    expect(placement.align).toBe("end");
    expect(cornerX).toBeGreaterThan(rect.left);
    expect(cornerX).toBeLessThan(rect.right);
    expect(cornerY).toBeGreaterThan(rect.top);
    expect(cornerY).toBeLessThan(rect.bottom);
    expect(cornerX).toBeLessThan(centerX);
    expect(Math.abs(cornerX - centerX)).toBeCloseTo(
      Math.abs(cornerY - centerY),
      5,
    );
  });
});
