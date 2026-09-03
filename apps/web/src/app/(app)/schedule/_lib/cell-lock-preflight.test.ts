import { describe, expect, it } from "vitest";
import type { CellLock } from "@/hooks/useCellLocks";
import {
  findConflictingCellLock,
  formatCellLockMessage,
  getImportTargetCellKeys,
  getLockedCellKeysInRange,
} from "./cell-lock-preflight";

function lock(overrides: Partial<CellLock> = {}): CellLock {
  return {
    editorSessionId: "session-2",
    userId: "user-2",
    userName: "Riley RN",
    cellKey: "emp-1_2026-04-12",
    lockRevision: 1,
    owner: "other_account",
    seriesId: null,
    ...overrides,
  };
}

describe("findConflictingCellLock", () => {
  it("matches exact cells and recurring-series identities", () => {
    const cellLock = lock();
    const seriesLock = lock({
      editorSessionId: "session-3",
      cellKey: "emp-2_2026-04-13",
      seriesId: "series-1",
    });

    expect(findConflictingCellLock([cellLock], [cellLock.cellKey])).toBe(cellLock);
    expect(findConflictingCellLock([seriesLock], [], ["series-1"])).toBe(seriesLock);
  });

  it("can resolve series identity from the latest local shift map", () => {
    const legacyLock = lock({ seriesId: null });
    expect(
      findConflictingCellLock([legacyLock], [], ["series-legacy"], () => "series-legacy"),
    ).toBe(legacyLock);
  });
});

describe("lock presentation and range filtering", () => {
  it("uses owner-aware messages", () => {
    expect(formatCellLockMessage(lock())).toBe("This cell is being edited by Riley RN.");
    expect(formatCellLockMessage(lock({ owner: "same_account" }))).toBe(
      "This cell is open in another tab or device for your account.",
    );
  });

  it("returns only locked cells inside the inclusive date range", () => {
    expect(
      getLockedCellKeysInRange(
        [
          lock({ cellKey: "emp-1_2026-04-11" }),
          lock({ cellKey: "emp-1_2026-04-12" }),
          lock({ cellKey: "emp-1_2026-04-18" }),
          lock({ cellKey: "emp-1_2026-04-19" }),
        ],
        { startDateKey: "2026-04-12", endDateKey: "2026-04-18" },
      ),
    ).toEqual(["emp-1_2026-04-12", "emp-1_2026-04-18"]);
  });
});

describe("getImportTargetCellKeys", () => {
  it("returns only cells the preview says the import will write", () => {
    expect(
      getImportTargetCellKeys([
        { employeeId: "emp-1", targetDate: "2026-04-12", outcome: "imported" },
        { employeeId: "emp-2", targetDate: "2026-04-13", outcome: "skipped" },
      ]),
    ).toEqual(["emp-1_2026-04-12"]);
  });
});
