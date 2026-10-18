import { describe, expect, it } from "vitest";

import {
  computeStickyReleaseInset,
  createStickyLayoutObserver,
  runLayoutSteps,
} from "./schedule-grid-sticky";

describe("computeStickyReleaseInset", () => {
  it("reserves the distance from the release row down to the card bottom", () => {
    expect(computeStickyReleaseInset({ cardBottom: 1400, releaseRowTop: 1100 })).toBe(300);
  });

  it("is independent of scroll position", () => {
    const atTop = computeStickyReleaseInset({ cardBottom: 1400, releaseRowTop: 1100 });
    const scrolled = computeStickyReleaseInset({ cardBottom: 400, releaseRowTop: 100 });
    expect(scrolled).toBe(atTop);
  });

  it("reserves nothing when the section has no release row", () => {
    expect(computeStickyReleaseInset({ cardBottom: 1400, releaseRowTop: null })).toBe(0);
  });

  it("never goes negative", () => {
    expect(computeStickyReleaseInset({ cardBottom: 100, releaseRowTop: 400 })).toBe(0);
  });

  it("ignores unmeasurable geometry", () => {
    expect(computeStickyReleaseInset({ cardBottom: Number.NaN, releaseRowTop: 100 })).toBe(0);
  });
});

describe("runLayoutSteps", () => {
  it("runs each step for every task before the next step", () => {
    const calls: string[] = [];
    const step = (name: string) => () => calls.push(name);
    runLayoutSteps([
      [step("a:read"), step("a:write"), step("a:read2"), step("a:write2")],
      [step("b:read"), step("b:write")],
    ]);
    expect(calls).toEqual(["a:read", "b:read", "a:write", "b:write", "a:read2", "a:write2"]);
  });

  it("does nothing without tasks", () => {
    expect(() => runLayoutSteps([])).not.toThrow();
  });
});

describe("createStickyLayoutObserver", () => {
  class FakeResizeObserver {
    static instances: FakeResizeObserver[] = [];
    readonly observed = new Set<Element>();
    constructor(private readonly callback: ResizeObserverCallback) {
      FakeResizeObserver.instances.push(this);
    }
    observe(target: Element) {
      this.observed.add(target);
    }
    unobserve(target: Element) {
      this.observed.delete(target);
    }
    disconnect() {
      this.observed.clear();
    }
    deliver(...targets: Element[]) {
      this.callback(
        targets.map((target) => ({ target }) as ResizeObserverEntry),
        this as unknown as ResizeObserver,
      );
    }
  }

  function setup() {
    FakeResizeObserver.instances = [];
    const layout = createStickyLayoutObserver(
      FakeResizeObserver as unknown as typeof ResizeObserver,
    );
    return { layout, observer: FakeResizeObserver.instances[0] };
  }

  function recordingTask(name: string, calls: string[]) {
    return () => [() => calls.push(`${name}:read`), () => calls.push(`${name}:write`)];
  }

  it("batches the sections that resize together, reads before writes", () => {
    const { layout, observer } = setup();
    const calls: string[] = [];
    const first = document.createElement("div");
    const second = document.createElement("div");
    layout.observe(first, recordingTask("first", calls));
    layout.observe(second, recordingTask("second", calls));

    observer.deliver(first, second);

    expect(calls).toEqual(["first:read", "second:read", "first:write", "second:write"]);
  });

  it("runs a task once when several of its targets resize in one delivery", () => {
    const { layout, observer } = setup();
    const calls: string[] = [];
    const grid = document.createElement("div");
    const body = document.createElement("div");
    const task = recordingTask("section", calls);
    layout.observe(grid, task);
    layout.observe(body, task);

    observer.deliver(grid, body);

    expect(calls).toEqual(["section:read", "section:write"]);
  });

  it("runs only the tasks whose targets resized", () => {
    const { layout, observer } = setup();
    const calls: string[] = [];
    const first = document.createElement("div");
    const second = document.createElement("div");
    layout.observe(first, recordingTask("first", calls));
    layout.observe(second, recordingTask("second", calls));

    observer.deliver(second);

    expect(calls).toEqual(["second:read", "second:write"]);
  });

  it("keeps a shared target observed until its last task stops", () => {
    const { layout, observer } = setup();
    const calls: string[] = [];
    const body = document.createElement("div");
    const stopFirst = layout.observe(body, recordingTask("first", calls));
    const stopSecond = layout.observe(body, recordingTask("second", calls));
    expect(observer.observed.has(body)).toBe(true);

    stopFirst();
    expect(observer.observed.has(body)).toBe(true);
    observer.deliver(body);
    expect(calls).toEqual(["second:read", "second:write"]);

    stopSecond();
    expect(observer.observed.has(body)).toBe(false);
  });

  it("ignores a repeated stop and entries for targets it no longer watches", () => {
    const { layout, observer } = setup();
    const calls: string[] = [];
    const grid = document.createElement("div");
    const stop = layout.observe(grid, recordingTask("section", calls));
    stop();
    stop();

    observer.deliver(grid);

    expect(calls).toEqual([]);
    expect(observer.observed.size).toBe(0);
  });

  it("observes a target again after it was released", () => {
    const { layout, observer } = setup();
    const calls: string[] = [];
    const grid = document.createElement("div");
    layout.observe(grid, recordingTask("old", calls))();
    layout.observe(grid, recordingTask("new", calls));

    expect(observer.observed.has(grid)).toBe(true);
    observer.deliver(grid);
    expect(calls).toEqual(["new:read", "new:write"]);
  });
});
