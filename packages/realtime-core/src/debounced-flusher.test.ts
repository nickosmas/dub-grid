import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDebouncedTableFlusher } from "./debounced-flusher";

describe("createDebouncedTableFlusher", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("coalesces a burst of events for the same table into a single flush", () => {
    const onFlush = vi.fn();
    const flusher = createDebouncedTableFlusher<"employees">(150, onFlush);

    flusher.markChanged("employees");
    flusher.markChanged("employees");
    flusher.markChanged("employees");

    expect(onFlush).not.toHaveBeenCalled();
    vi.advanceTimersByTime(150);

    expect(onFlush).toHaveBeenCalledTimes(1);
    expect(onFlush).toHaveBeenCalledWith(["employees"]);
  });

  it("dedupes multiple distinct tables changed within one window into one flush call", () => {
    const onFlush = vi.fn();
    const flusher = createDebouncedTableFlusher<"employees" | "jobs">(150, onFlush);

    flusher.markChanged("employees");
    flusher.markChanged("jobs");
    vi.advanceTimersByTime(150);

    expect(onFlush).toHaveBeenCalledTimes(1);
    expect(onFlush).toHaveBeenCalledWith(["employees", "jobs"]);
  });

  it("starts a fresh window after a flush", () => {
    const onFlush = vi.fn();
    const flusher = createDebouncedTableFlusher<"employees">(150, onFlush);

    flusher.markChanged("employees");
    vi.advanceTimersByTime(150);
    flusher.markChanged("employees");
    vi.advanceTimersByTime(150);

    expect(onFlush).toHaveBeenCalledTimes(2);
  });

  it("dispose cancels a pending flush", () => {
    const onFlush = vi.fn();
    const flusher = createDebouncedTableFlusher<"employees">(150, onFlush);

    flusher.markChanged("employees");
    flusher.dispose();
    vi.advanceTimersByTime(150);

    expect(onFlush).not.toHaveBeenCalled();
  });
});
