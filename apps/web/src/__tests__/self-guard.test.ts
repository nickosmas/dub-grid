import { describe, expect, it } from "vitest";
import {
  SELF_ACTION_FORBIDDEN_CODE,
  SelfActionForbiddenError,
  assertNotSelf,
  isSelfAction,
} from "@dubgrid/domain";

describe("self-guard", () => {
  describe("isSelfAction", () => {
    it("returns true when both ids match", () => {
      expect(isSelfAction("user-1", "user-1")).toBe(true);
    });

    it("returns false when ids differ", () => {
      expect(isSelfAction("user-1", "user-2")).toBe(false);
    });

    it("returns false when either id is null or undefined", () => {
      expect(isSelfAction(null, "user-1")).toBe(false);
      expect(isSelfAction("user-1", null)).toBe(false);
      expect(isSelfAction(undefined, undefined)).toBe(false);
    });
  });

  describe("assertNotSelf", () => {
    it("does not throw when ids differ", () => {
      expect(() => assertNotSelf("user-1", "user-2")).not.toThrow();
    });

    it("throws SelfActionForbiddenError when ids match", () => {
      try {
        assertNotSelf("user-1", "user-1");
        throw new Error("expected throw");
      } catch (err) {
        expect(err).toBeInstanceOf(SelfActionForbiddenError);
        expect((err as SelfActionForbiddenError).code).toBe(SELF_ACTION_FORBIDDEN_CODE);
      }
    });

    it("does not throw when one id is null", () => {
      expect(() => assertNotSelf(null, "user-1")).not.toThrow();
      expect(() => assertNotSelf("user-1", null)).not.toThrow();
    });
  });
});
