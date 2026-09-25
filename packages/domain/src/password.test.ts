import { describe, expect, it } from "vitest";
import {
  PASSWORD_MISMATCH_MESSAGE,
  PASSWORD_STRENGTH_LABELS,
  getPasswordMismatchError,
  getPasswordStrengthHints,
  getPasswordStrengthLevel,
  isPasswordAcceptable,
  passwordsMatch,
} from "./password";

describe("getPasswordStrengthLevel", () => {
  // Length gates everything: character variety cannot rescue a short password,
  // because length is what actually resists a brute force.
  it("reports 'too short' regardless of character variety", () => {
    expect(getPasswordStrengthLevel("Aa1!")).toBe(0);
    expect(getPasswordStrengthLevel("Ab3$Xy9#")).toBe(0);
    expect(PASSWORD_STRENGTH_LABELS[0]).toBe("Too short");
  });

  it("climbs as character classes are added past the length bar", () => {
    expect(getPasswordStrengthLevel("aaaaaaaaaa")).toBe(1);
    expect(getPasswordStrengthLevel("Aaaaaaaaa1")).toBe(2);
    expect(getPasswordStrengthLevel("Aaaaaaaa1!")).toBe(3);
  });

  it("indexes the label list without overflowing it", () => {
    for (const candidate of ["", "short", "aaaaaaaaaa", "Aaaaaaaaa1", "Aaaaaaaa1!"]) {
      const level = getPasswordStrengthLevel(candidate);
      expect(PASSWORD_STRENGTH_LABELS[level]).toBeTruthy();
    }
  });
});

describe("isPasswordAcceptable", () => {
  // The bar both apps now enforce. Web used to accept anything >= 10 chars,
  // which let "aaaaaaaaaa" through while mobile rejected it.
  it("rejects a long but weak password", () => {
    expect(isPasswordAcceptable("aaaaaaaaaa")).toBe(false);
  });

  it("rejects a strong but short password", () => {
    expect(isPasswordAcceptable("Aa1!")).toBe(false);
  });

  it("accepts a letter and a number with an uppercase letter or a symbol", () => {
    expect(isPasswordAcceptable("Aaaaaaaaa1")).toBe(true);
    expect(isPasswordAcceptable("aaaaaaaa1!")).toBe(true);
    expect(isPasswordAcceptable("Aaaaaaaa1!")).toBe(true);
  });

  // Supabase requires a letter and a digit; these used to pass the app and
  // then fail at sign-up (41d3, F-47).
  it("refuses a password without a number or without a letter", () => {
    expect(isPasswordAcceptable("Abcdefghij!")).toBe(false);
    expect(isPasswordAcceptable("1234567890!")).toBe(false);
  });
});

describe("getPasswordStrengthHints", () => {
  it("reports each rule independently", () => {
    const hints = getPasswordStrengthHints("Aaaaaaaaa1");
    const met = Object.fromEntries(hints.map((hint) => [hint.id, hint.met]));

    expect(met).toEqual({ length: true, uppercase: true, number: true, symbol: false });
  });
});

describe("passwordsMatch / getPasswordMismatchError", () => {
  it("matches identical strings", () => {
    expect(passwordsMatch("Aaaaaaaa1!", "Aaaaaaaa1!")).toBe(true);
    expect(passwordsMatch("Aaaaaaaa1!", "aaaaaaaa1!")).toBe(false);
  });

  // Live validation must not accuse the user before they have typed anything.
  it("stays quiet while the confirmation is empty", () => {
    expect(getPasswordMismatchError("Aaaaaaaa1!", "")).toBeNull();
  });

  it("warns as soon as the confirmation diverges", () => {
    expect(getPasswordMismatchError("Aaaaaaaa1!", "A")).toBe(PASSWORD_MISMATCH_MESSAGE);
  });

  it("clears once they agree", () => {
    expect(getPasswordMismatchError("Aaaaaaaa1!", "Aaaaaaaa1!")).toBeNull();
  });
});
