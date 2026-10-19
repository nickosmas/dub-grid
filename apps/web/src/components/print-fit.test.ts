import { describe, expect, it } from "vitest";

import { fitPrintText, fitScale, PRINT_FIT_MIN_SCALE } from "@/components/print-fit";

describe("fitScale", () => {
  it("leaves text that fits at full size", () => {
    expect(fitScale(100, 80)).toBe(1);
    expect(fitScale(100, 100.4)).toBe(1);
  });

  it("shrinks overflowing text by the ratio of room to width", () => {
    expect(fitScale(50, 100)).toBe(0.5);
  });

  it("compounds with a scale already applied", () => {
    expect(fitScale(50, 100, 0.8)).toBeCloseTo(0.4);
  });

  it("stops at the legibility floor", () => {
    expect(fitScale(1, 100)).toBe(PRINT_FIT_MIN_SCALE);
  });
});

describe("fitPrintText", () => {
  // jsdom has no layout, so each element reports a width that follows its scale.
  function fitElement(room: number, naturalWidth: number): HTMLElement {
    const element = document.createElement("span");
    element.setAttribute("data-print-fit", "");
    Object.defineProperty(element, "clientWidth", { get: () => room });
    Object.defineProperty(element, "scrollWidth", {
      get: () => {
        const scale = element.style.fontSize ? parseFloat(element.style.fontSize) : 1;
        return Math.max(room, naturalWidth * scale);
      },
    });
    return element;
  }

  it("shrinks only the labels that overflow, and clears an old size first", () => {
    const root = document.createElement("div");
    const wide = fitElement(40, 100);
    const narrow = fitElement(40, 30);
    narrow.style.fontSize = "0.5em";
    root.append(wide, narrow);

    fitPrintText(root);

    expect(wide.style.fontSize).toBe("0.4em");
    expect(narrow.style.fontSize).toBe("");
  });
});
