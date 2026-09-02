import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ScrollOverflowCue } from "@/components/ui/ScrollOverflowCue";

function setDimension(
  element: HTMLElement,
  property: "clientHeight" | "scrollHeight",
  value: number,
) {
  Object.defineProperty(element, property, { configurable: true, value });
}

function renderOverflowingSurface() {
  render(
    <div data-testid="root" style={{ position: "relative", width: 400, height: 500 }}>
      <div data-testid="scroller" style={{ overflowY: "auto", height: 400 }}>
        Content
      </div>
      <ScrollOverflowCue />
    </div>,
  );

  const root = screen.getByTestId("root");
  const scroller = screen.getByTestId("scroller");
  vi.spyOn(root, "getBoundingClientRect").mockReturnValue({
    x: 0,
    y: 0,
    top: 0,
    right: 400,
    bottom: 500,
    left: 0,
    width: 400,
    height: 500,
    toJSON: () => ({}),
  });
  vi.spyOn(scroller, "getBoundingClientRect").mockReturnValue({
    x: 0,
    y: 60,
    top: 60,
    right: 400,
    bottom: 460,
    left: 0,
    width: 400,
    height: 400,
    toJSON: () => ({}),
  });
  setDimension(scroller, "clientHeight", 400);
  setDimension(scroller, "scrollHeight", 900);
  Object.defineProperty(scroller, "scrollTop", { configurable: true, writable: true, value: 0 });
  Object.defineProperty(scroller, "scrollBy", { configurable: true, value: vi.fn() });
  fireEvent(window, new Event("resize"));

  return scroller;
}

describe("ScrollOverflowCue", () => {
  it("shows only while scrollable content remains below the viewport", async () => {
    const scroller = renderOverflowingSurface();

    const cue = await screen.findByRole("button", { name: "Scroll down for more content" });
    expect(cue).toBeInTheDocument();
    expect(cue).toHaveStyle({ bottom: "52px" });
    expect(cue.style.left).toBe("");
    expect(cue.style.top).toBe("");

    scroller.scrollTop = 500;
    fireEvent.scroll(scroller);

    await waitFor(() => {
      expect(
        screen.queryByRole("button", { name: "Scroll down for more content" }),
      ).not.toBeInTheDocument();
    });

    scroller.scrollTop = 300;
    fireEvent.scroll(scroller);

    expect(
      await screen.findByRole("button", { name: "Scroll down for more content" }),
    ).toBeInTheDocument();
  });

  it("scrolls the active overlay viewport when selected", async () => {
    const scroller = renderOverflowingSurface();

    fireEvent.click(await screen.findByRole("button", { name: "Scroll down for more content" }));

    expect(scroller.scrollBy).toHaveBeenCalledWith({
      top: 288,
      behavior: expect.stringMatching(/^(auto|smooth)$/),
    });
  });

  it("stays hidden when the content already fits", async () => {
    const scroller = renderOverflowingSurface();
    setDimension(scroller, "scrollHeight", 400);
    fireEvent(window, new Event("resize"));

    await waitFor(() => {
      expect(
        screen.queryByRole("button", { name: "Scroll down for more content" }),
      ).not.toBeInTheDocument();
    });
  });

  it("tracks document rows from a fixed viewport position", async () => {
    Object.defineProperty(document, "scrollingElement", {
      configurable: true,
      value: document.documentElement,
    });
    Object.defineProperty(document.documentElement, "scrollHeight", {
      configurable: true,
      value: 1200,
    });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 500 });
    Object.defineProperty(window, "scrollY", {
      configurable: true,
      writable: true,
      value: 0,
    });
    const scrollBy = vi.fn();
    Object.defineProperty(window, "scrollBy", { configurable: true, value: scrollBy });

    render(
      <main>
        <ScrollOverflowCue documentViewport />
      </main>,
    );
    fireEvent(window, new Event("resize"));

    const cue = await screen.findByRole("button", { name: "Scroll down for more content" });
    expect(cue).toHaveClass("dg-scroll-overflow-cue--viewport");
    fireEvent.click(cue);
    expect(scrollBy).toHaveBeenCalledWith({
      top: 360,
      behavior: expect.stringMatching(/auto|smooth/),
    });

    window.scrollY = 700;
    fireEvent.scroll(window);
    await waitFor(() => {
      expect(
        screen.queryByRole("button", { name: "Scroll down for more content" }),
      ).not.toBeInTheDocument();
    });
  });
});
