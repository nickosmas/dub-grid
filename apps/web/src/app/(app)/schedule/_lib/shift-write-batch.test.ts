import { describe, expect, it } from "vitest";
import {
  cellWriteBatchMessage,
  chunk,
  createConcurrencyLimit,
  lastWritePerCell,
  reconcileCellWrites,
  tallyCellWrites,
  withoutUnsavedWrites,
  type CellWriteOutcome,
} from "./shift-write-batch";

type Row = { id: string };

describe("chunk", () => {
  it("splits into runs of the size, the last one shorter", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 50)).toEqual([]);
  });
});

describe("lastWritePerCell", () => {
  it("keeps one write per cell, the last one asked for", () => {
    const writes = [
      { employeeId: "a", dateKey: "2026-11-02", input: null },
      { employeeId: "b", dateKey: "2026-11-02", input: null },
      {
        employeeId: "a",
        dateKey: "2026-11-02",
        input: {
          kind: "absence" as const,
          segments: [],
          absenceTypeId: 7,
          customStartTime: null,
          customEndTime: null,
          seriesId: null,
          fromRecurring: false,
        },
      },
    ];
    expect(lastWritePerCell(writes)).toEqual([writes[1], writes[2]]);
  });
});

describe("createConcurrencyLimit", () => {
  it("never runs more tasks at once than the limit, and runs them all", async () => {
    const limit = createConcurrencyLimit(2);
    let running = 0;
    let most = 0;
    const results = await Promise.all(
      [1, 2, 3, 4, 5].map((value) =>
        limit(async () => {
          running += 1;
          most = Math.max(most, running);
          await new Promise((resolve) => setTimeout(resolve, 1));
          running -= 1;
          return value * 10;
        }),
      ),
    );
    expect(results).toEqual([10, 20, 30, 40, 50]);
    expect(most).toBe(2);
  });

  it("frees the slot when a task fails", async () => {
    const limit = createConcurrencyLimit(1);
    await expect(limit(() => Promise.reject(new Error("no")))).rejects.toThrow("no");
    await expect(limit(async () => "next")).resolves.toBe("next");
  });
});

describe("reconcileCellWrites", () => {
  const before: Row = { id: "before" };
  const optimisticA: Row = { id: "optimistic-a" };
  const optimisticB: Row = { id: "optimistic-b" };
  const server: Row = { id: "server" };

  function setup() {
    const optimistic = new Map<string, Row | null>([
      ["a", optimisticA],
      ["b", optimisticB],
      ["c", null],
    ]);
    const previous = new Map<string, Row | undefined>([
      ["a", before],
      ["b", undefined],
      ["c", before],
    ]);
    const current: Record<string, Row> = { a: optimisticA, b: optimisticB, other: before };
    return { optimistic, previous, current };
  }

  it("takes the server row for a saved cell and drops one the server emptied", () => {
    const { optimistic, previous, current } = setup();
    const outcomes: CellWriteOutcome<Row>[] = [
      { key: "a", status: "saved", row: server },
      { key: "b", status: "saved", row: null },
      { key: "c", status: "saved" },
    ];
    expect(reconcileCellWrites(current, outcomes, optimistic, previous)).toEqual({
      a: server,
      other: before,
    });
  });

  it("puts a failed cell back as it was, removing one that was empty", () => {
    const { optimistic, previous, current } = setup();
    const outcomes: CellWriteOutcome<Row>[] = [
      { key: "a", status: "failed" },
      { key: "b", status: "failed" },
      { key: "c", status: "failed" },
    ];
    expect(reconcileCellWrites(current, outcomes, optimistic, previous)).toEqual({
      a: before,
      c: before,
      other: before,
    });
  });

  it("shows the server's row for a conflict, and keeps the optimistic one when it has none", () => {
    const { optimistic, previous, current } = setup();
    const outcomes: CellWriteOutcome<Row>[] = [
      { key: "a", status: "conflict", row: server },
      { key: "b", status: "conflict" },
    ];
    expect(reconcileCellWrites(current, outcomes, optimistic, previous)).toEqual({
      a: server,
      b: optimisticB,
      other: before,
    });
  });

  it("leaves a cell edited again since the bulk change", () => {
    const { optimistic, previous, current } = setup();
    const newer: Row = { id: "newer" };
    const outcomes: CellWriteOutcome<Row>[] = [{ key: "a", status: "failed" }];
    const next = reconcileCellWrites({ ...current, a: newer }, outcomes, optimistic, previous);
    expect(next.a).toBe(newer);
  });

  it("returns the same map when nothing changes", () => {
    const { optimistic, previous, current } = setup();
    expect(
      reconcileCellWrites(current, [{ key: "a", status: "saved" }], optimistic, previous),
    ).toBe(current);
  });
});

describe("tallyCellWrites", () => {
  it("counts each outcome and names the cells that didn't save", () => {
    const result = tallyCellWrites([
      { key: "a", status: "saved" },
      { key: "b", status: "conflict" },
      { key: "c", status: "failed" },
      { key: "d", status: "saved" },
    ]);
    expect(result).toMatchObject({ total: 4, saved: 2, failed: 1, conflicts: 1 });
    expect([...result.unsaved]).toEqual(["b", "c"]);
  });
});

describe("withoutUnsavedWrites", () => {
  it("drops the unsaved cells from both sides of an applied change", () => {
    const write = (employeeId: string) => ({ employeeId, dateKey: "2026-11-02", input: null });
    const applied = { before: [write("a"), write("b")], writes: [write("a"), write("b")] };
    expect(withoutUnsavedWrites(applied, new Set(["b_2026-11-02"]))).toEqual({
      before: [write("a")],
      writes: [write("a")],
    });
  });
});

describe("cellWriteBatchMessage", () => {
  it("says nothing when every shift saved", () => {
    expect(cellWriteBatchMessage({ total: 3, saved: 3, failed: 0, conflicts: 0 })).toBeNull();
  });

  it("names how many saved and how many were put back", () => {
    expect(cellWriteBatchMessage({ total: 190, saved: 182, failed: 8, conflicts: 0 })).toBe(
      "Saved 182 of 190 shifts. 8 couldn't be saved, so they were put back.",
    );
    expect(cellWriteBatchMessage({ total: 5, saved: 4, failed: 1, conflicts: 0 })).toBe(
      "Saved 4 of 5 shifts. 1 couldn't be saved, so it was put back.",
    );
  });

  it("says when none saved", () => {
    expect(cellWriteBatchMessage({ total: 6, saved: 0, failed: 6, conflicts: 0 })).toBe(
      "None of the 6 shifts could be saved, so they were put back.",
    );
    expect(cellWriteBatchMessage({ total: 1, saved: 0, failed: 1, conflicts: 0 })).toBe(
      "We couldn't save that shift, so it was put back.",
    );
  });

  it("says once that someone else changed shifts", () => {
    expect(cellWriteBatchMessage({ total: 10, saved: 7, failed: 0, conflicts: 3 })).toBe(
      "Someone else just changed 3 of these shifts. Showing the latest version.",
    );
    expect(cellWriteBatchMessage({ total: 1, saved: 0, failed: 0, conflicts: 1 })).toBe(
      "Someone else just changed this shift. Showing the latest version.",
    );
  });

  it("puts failures and conflicts in one message", () => {
    expect(cellWriteBatchMessage({ total: 10, saved: 6, failed: 2, conflicts: 2 })).toBe(
      "Saved 6 of 10 shifts. 2 couldn't be saved, so they were put back. 2 were just changed by someone else, so they show the latest version.",
    );
  });
});
