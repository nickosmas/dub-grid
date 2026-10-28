import { describe, expect, it } from "vitest";
import {
  ACCESS_SUSPENDED_BODY,
  ACCOUNT_SUSPENDED_MESSAGE,
  accessSuspendedBody,
  isAccountSuspendedMessage,
  suspendedUntilFromMessage,
} from "./account-status";

describe("a suspension's end at sign-in (51g3)", () => {
  it("reads the end the hook adds, and still knows the sentinel", () => {
    const withEnd = `${ACCOUNT_SUSPENDED_MESSAGE} Until 2026-11-20.`;
    expect(isAccountSuspendedMessage(withEnd)).toBe(true);
    expect(suspendedUntilFromMessage(withEnd)).toBe("2026-11-20");
    expect(suspendedUntilFromMessage(ACCOUNT_SUSPENDED_MESSAGE)).toBeNull();
    expect(suspendedUntilFromMessage("Until 2026-11-20.")).toBeNull();
  });

  it("names the day they get access back, and only their state", () => {
    expect(accessSuspendedBody("2026-11-20")).toBe(
      "Your organization has suspended your access to the app until Fri, Nov 20. Contact an administrator there if you have questions.",
    );
    expect(accessSuspendedBody(null)).toBe(ACCESS_SUSPENDED_BODY);
    expect(accessSuspendedBody("soon")).toBe(ACCESS_SUSPENDED_BODY);
  });
});
