import { describe, it, expect } from "vitest";
import { OptimisticLockError } from "@/lib/db/shared";

describe("OptimisticLockError", () => {
  describe("construction", () => {
    it("creates an error with shiftId and expectedVersion", () => {
      const err = new OptimisticLockError("emp-1:2026-04-07", 3);
      expect(err.shiftId).toBe("emp-1:2026-04-07");
      expect(err.expectedVersion).toBe(3);
      expect(err.actualVersion).toBeUndefined();
    });

    it("creates an error with shiftId, expectedVersion, and actualVersion", () => {
      const err = new OptimisticLockError("emp-1:2026-04-07", 3, 5);
      expect(err.shiftId).toBe("emp-1:2026-04-07");
      expect(err.expectedVersion).toBe(3);
      expect(err.actualVersion).toBe(5);
    });
  });

  describe("error name", () => {
    it("has name set to 'OptimisticLockError'", () => {
      const err = new OptimisticLockError("shift-1", 1);
      expect(err.name).toBe("OptimisticLockError");
    });
  });

  describe("error message format", () => {
    it("formats message without actualVersion", () => {
      const err = new OptimisticLockError("emp-1:2026-04-07", 3);
      expect(err.message).toBe(
        "Optimistic lock failed for shift emp-1:2026-04-07: expected version 3",
      );
    });

    it("formats message with actualVersion", () => {
      const err = new OptimisticLockError("emp-1:2026-04-07", 3, 5);
      expect(err.message).toBe(
        "Optimistic lock failed for shift emp-1:2026-04-07: expected version 3, but found version 5",
      );
    });

    it("handles version 0", () => {
      const err = new OptimisticLockError("emp-2:2026-01-01", 0);
      expect(err.message).toBe(
        "Optimistic lock failed for shift emp-2:2026-01-01: expected version 0",
      );
    });

    it("handles actualVersion of 0", () => {
      const err = new OptimisticLockError("emp-2:2026-01-01", 1, 0);
      expect(err.message).toBe(
        "Optimistic lock failed for shift emp-2:2026-01-01: expected version 1, but found version 0",
      );
    });
  });

  describe("Error inheritance", () => {
    it("is an instance of Error", () => {
      const err = new OptimisticLockError("shift-1", 1);
      expect(err).toBeInstanceOf(Error);
    });

    it("is an instance of OptimisticLockError", () => {
      const err = new OptimisticLockError("shift-1", 1);
      expect(err).toBeInstanceOf(OptimisticLockError);
    });

    it("has a stack trace", () => {
      const err = new OptimisticLockError("shift-1", 1);
      expect(err.stack).toBeDefined();
      expect(err.stack).toContain("OptimisticLockError");
    });

    it("can be caught as a generic Error", () => {
      let caught: Error | null = null;
      try {
        throw new OptimisticLockError("shift-1", 2, 4);
      } catch (e) {
        caught = e as Error;
      }
      expect(caught).toBeInstanceOf(Error);
      expect(caught).toBeInstanceOf(OptimisticLockError);
      expect((caught as OptimisticLockError).shiftId).toBe("shift-1");
    });

    it("can be discriminated from plain Error via name", () => {
      const plain = new Error("generic error");
      const lock = new OptimisticLockError("shift-1", 1);
      expect(plain.name).toBe("Error");
      expect(lock.name).toBe("OptimisticLockError");
    });
  });
});
