import { describe, expect, it } from "vitest";
import {
  encodeSandboxCookieValue,
  getSandboxFromCookie,
  SANDBOX_COOKIE_NAME,
} from "./sandbox-cookie";

const data = {
  sandboxOrgId: "11111111-1111-4111-8111-111111111111",
  userId: "22222222-2222-4222-8222-222222222222",
  sessionId: "33333333-3333-4333-8333-333333333333",
};

describe("Test Sandbox cookie", () => {
  it("round-trips session-bound sandbox state", () => {
    const cookie = `${SANDBOX_COOKIE_NAME}=${encodeSandboxCookieValue(data)}`;
    expect(getSandboxFromCookie(cookie)).toEqual(data);
  });

  it.each([
    [{ ...data, sandboxOrgId: "" }],
    [{ ...data, userId: "" }],
    [{ ...data, sessionId: "" }],
    [{ sandboxOrgId: data.sandboxOrgId, userId: data.userId }],
  ])("rejects malformed or legacy unbound state", (value) => {
    const cookie = `${SANDBOX_COOKIE_NAME}=${encodeURIComponent(JSON.stringify(value))}`;
    expect(getSandboxFromCookie(cookie)).toBeNull();
  });
});
