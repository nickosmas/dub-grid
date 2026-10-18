import { act, render } from "@testing-library/react";
import { Profiler } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { brandMotionFrames, brandRestFrame } from "@dubgrid/design-tokens";
import { AnimatedDubGridLogo, brandFrameMarkup } from "./AnimatedDubGridLogo";

let frameCallbacks: FrameRequestCallback[] = [];
let now = 0;

function runFrame(advanceMs: number) {
  now += advanceMs;
  const callbacks = frameCallbacks;
  frameCallbacks = [];
  for (const callback of callbacks) callback(now);
}

function stubReducedMotion(matches: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  );
}

beforeEach(() => {
  frameCallbacks = [];
  now = 0;
  vi.spyOn(performance, "now").mockImplementation(() => now);
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    frameCallbacks.push(callback);
    return frameCallbacks.length;
  });
  vi.stubGlobal("cancelAnimationFrame", () => {
    frameCallbacks = [];
  });
  stubReducedMotion(false);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("brandFrameMarkup", () => {
  it("draws every visible card, masking each by the cards in front of it", () => {
    const frame = brandMotionFrames.shuffle(0.4);
    const visible = frame.cards.filter((card) => card.opacity >= 0.01);
    const host = document.createElement("div");
    host.innerHTML = brandFrameMarkup(frame, 96, "logo");

    const svg = host.querySelector("svg");
    expect(svg?.getAttribute("width")).toBe("96");
    expect(svg?.getAttribute("aria-hidden")).toBe("true");
    const cards = [...host.querySelectorAll("svg > path")];
    expect(cards).toHaveLength(visible.length);
    expect(host.querySelectorAll("mask")).toHaveLength(visible.length - 1);
    expect(cards.at(-1)?.getAttribute("mask")).toBeNull();
    expect(cards[0].getAttribute("mask")).toBe("url(#dg-motion-logo-0)");
  });
});

describe("AnimatedDubGridLogo", () => {
  it("draws its frames without re-rendering", () => {
    const onRender = vi.fn();
    const { container } = render(
      <Profiler id="logo" onRender={onRender}>
        <AnimatedDubGridLogo animation="shuffle" />
      </Profiler>,
    );
    const rest = container.innerHTML;
    const renders = onRender.mock.calls.length;

    act(() => runFrame(400));
    const moved = container.innerHTML;
    act(() => runFrame(400));

    expect(moved).not.toBe(rest);
    expect(container.innerHTML).not.toBe(moved);
    expect(container.querySelectorAll("svg")).toHaveLength(1);
    expect(onRender.mock.calls.length).toBe(renders);
  });

  it("rests and requests no frames when motion is reduced", () => {
    stubReducedMotion(true);
    const { container } = render(<AnimatedDubGridLogo animation="shuffle" />);
    const host = document.createElement("div");
    host.innerHTML = brandFrameMarkup(brandRestFrame(), 96, "x");

    expect(frameCallbacks).toHaveLength(0);
    expect(container.querySelectorAll("svg > path")).toHaveLength(
      host.querySelectorAll("svg > path").length,
    );
  });

  it("stops drawing once unmounted", () => {
    const { unmount } = render(<AnimatedDubGridLogo animation="climb" />);
    expect(frameCallbacks).toHaveLength(1);
    unmount();
    expect(frameCallbacks).toHaveLength(0);
  });
});
