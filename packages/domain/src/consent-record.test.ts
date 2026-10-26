import { describe, expect, it } from "vitest";
import { needsConsentRecord, parseConsentRecordMark } from "./consent-record";

const current = { version: "1.2", analytics: true, userId: null };

describe("needsConsentRecord", () => {
  it("records a choice that was never recorded", () => {
    expect(needsConsentRecord(null, current)).toBe(true);
  });

  it("records again once someone signs in after an anonymous record", () => {
    expect(needsConsentRecord({ ...current, userId: null }, { ...current, userId: "user-1" })).toBe(
      true,
    );
  });

  it("records again for a different signed-in user", () => {
    expect(
      needsConsentRecord({ ...current, userId: "user-1" }, { ...current, userId: "user-2" }),
    ).toBe(true);
  });

  it("records again after a policy version bump", () => {
    expect(needsConsentRecord({ ...current, version: "1.1" }, current)).toBe(true);
  });

  it("records again when the choice itself differs from the record", () => {
    expect(needsConsentRecord({ ...current, analytics: false }, current)).toBe(true);
  });

  it("does not re-send a choice already recorded for this user", () => {
    expect(
      needsConsentRecord({ ...current, userId: "user-1" }, { ...current, userId: "user-1" }),
    ).toBe(false);
    expect(needsConsentRecord(current, current)).toBe(false);
  });

  it("does not re-send after signing out of a recorded account", () => {
    expect(needsConsentRecord({ ...current, userId: "user-1" }, current)).toBe(false);
  });
});

describe("parseConsentRecordMark", () => {
  it("reads a stored mark", () => {
    expect(parseConsentRecordMark('{"version":"1.2","analytics":false,"userId":"u"}')).toEqual({
      version: "1.2",
      analytics: false,
      userId: "u",
    });
  });

  it("treats a missing or malformed mark as never recorded", () => {
    expect(parseConsentRecordMark(null)).toBeNull();
    expect(parseConsentRecordMark("not json")).toBeNull();
    expect(parseConsentRecordMark('{"version":"1.2"}')).toBeNull();
    expect(parseConsentRecordMark('{"version":"1.2","analytics":true,"userId":4}')).toBeNull();
  });
});
