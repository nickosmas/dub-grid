import { describe, expect, it } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import type { ShiftMap } from "@/types";
import {
  readScheduleWindow,
  scheduleWindowKey,
  writeScheduleWindow,
  type CachedScheduleWindow,
} from "./schedule-cache";

const shifts = {} as ShiftMap;

function snapshot(overrides: Partial<CachedScheduleWindow> = {}): CachedScheduleWindow {
  return {
    window: { start: "2026-05-25", end: "2026-11-21" },
    shifts,
    notes: { "emp-1_2026-08-03_5": [{ indicatorTypeId: 10, status: "published" }] },
    canEditShifts: true,
    ...overrides,
  };
}

describe("schedule window cache", () => {
  it("round-trips a snapshot for the same org and permission", () => {
    const qc = new QueryClient();
    writeScheduleWindow(qc, "org-1", snapshot());

    expect(readScheduleWindow(qc, "org-1", true)).toEqual(snapshot());
  });

  it("misses when nothing has been written", () => {
    expect(readScheduleWindow(new QueryClient(), "org-1", true)).toBeNull();
  });

  it("misses for a different org rather than serving another org's grid", () => {
    const qc = new QueryClient();
    writeScheduleWindow(qc, "org-1", snapshot());

    expect(readScheduleWindow(qc, "org-2", true)).toBeNull();
  });

  it("returns null when there is no org yet", () => {
    const qc = new QueryClient();
    writeScheduleWindow(qc, "org-1", snapshot());

    expect(readScheduleWindow(qc, null, true)).toBeNull();
  });

  // fetchShifts returns a different shape per permission, so a snapshot taken
  // as a viewer must not paint for a scheduler, or the reverse.
  it("misses when the caller's edit permission differs from the snapshot's", () => {
    const qc = new QueryClient();
    writeScheduleWindow(qc, "org-1", snapshot({ canEditShifts: false }));

    expect(readScheduleWindow(qc, "org-1", true)).toBeNull();
    expect(readScheduleWindow(qc, "org-1", false)).not.toBeNull();
  });

  it("misses on a malformed window instead of seeding an unusable range", () => {
    const qc = new QueryClient();
    qc.setQueryData(scheduleWindowKey("org-1"), {
      ...snapshot(),
      window: { start: "", end: "" },
    });

    expect(readScheduleWindow(qc, "org-1", true)).toBeNull();
  });

  it("overwrites rather than merging, so a narrowed window does not keep stale cells", () => {
    const qc = new QueryClient();
    writeScheduleWindow(qc, "org-1", snapshot());
    writeScheduleWindow(
      qc,
      "org-1",
      snapshot({ window: { start: "2026-08-01", end: "2026-08-31" }, notes: {} }),
    );

    const cached = readScheduleWindow(qc, "org-1", true);
    expect(cached?.window).toEqual({ start: "2026-08-01", end: "2026-08-31" });
    expect(cached?.notes).toEqual({});
  });

  // The initial load can run before permissions resolve, write the snapshot as
  // a viewer, and only then have the scheduler re-fetch land. If that re-fetch
  // does not restamp the entry, every later visit arrives with permissions
  // already cached and true, mismatches, and refetches the whole window — a
  // permanent miss for exactly the people who use the page most.
  it("serves an editor once the late scheduler re-fetch restamps the snapshot", () => {
    const qc = new QueryClient();

    // Initial load, permissions not resolved yet.
    writeScheduleWindow(qc, "org-1", snapshot({ canEditShifts: false }));
    expect(readScheduleWindow(qc, "org-1", true)).toBeNull();

    // Permissions resolve; the scheduler re-fetch restamps it.
    writeScheduleWindow(qc, "org-1", snapshot({ canEditShifts: true }));

    expect(readScheduleWindow(qc, "org-1", true)).not.toBeNull();
  });

  // The entry has no observer, so it is subject to garbage collection. The
  // client's default gcTime is 5 minutes, which would silently cap this at
  // "returned within five minutes".
  it("is not garbage-collected while unobserved", () => {
    const qc = new QueryClient({ defaultOptions: { queries: { gcTime: 0 } } });
    writeScheduleWindow(qc, "org-1", snapshot());

    const entry = qc.getQueryCache().find({ queryKey: scheduleWindowKey("org-1") });
    expect(entry?.gcTime).toBe(Infinity);
  });

  // queryClient.clear() is what the org switch, impersonation and logout paths
  // already call; the snapshot must not survive it.
  it("is dropped by queryClient.clear()", () => {
    const qc = new QueryClient();
    writeScheduleWindow(qc, "org-1", snapshot());
    qc.clear();

    expect(readScheduleWindow(qc, "org-1", true)).toBeNull();
  });
});
