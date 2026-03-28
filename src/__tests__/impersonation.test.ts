import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  getImpersonationFromCookie,
  setImpersonationCookie,
  clearImpersonationCookie,
  IMPERSONATION_COOKIE_NAME,
} from "@/lib/impersonation";
import { makeImpersonationData } from "./factories";

// ── getImpersonationFromCookie ───────────────────────────────────────────────

describe("getImpersonationFromCookie", () => {
  it("parses valid cookie with all fields", () => {
    const data = makeImpersonationData();
    const cookieStr = `${IMPERSONATION_COOKIE_NAME}=${encodeURIComponent(JSON.stringify(data))}`;
    const result = getImpersonationFromCookie(cookieStr);
    expect(result).toEqual(data);
  });

  it("parses cookie with browser separator ('; ')", () => {
    const data = makeImpersonationData();
    const cookieStr = `other=value; ${IMPERSONATION_COOKIE_NAME}=${encodeURIComponent(JSON.stringify(data))}; another=123`;
    const result = getImpersonationFromCookie(cookieStr);
    expect(result).toEqual(data);
  });

  it("parses cookie with edge separator (';' no space)", () => {
    const data = makeImpersonationData();
    const cookieStr = `other=value;${IMPERSONATION_COOKIE_NAME}=${encodeURIComponent(JSON.stringify(data))}`;
    const result = getImpersonationFromCookie(cookieStr);
    expect(result).toEqual(data);
  });

  it("returns null for empty cookie string", () => {
    expect(getImpersonationFromCookie("")).toBeNull();
  });

  it("returns null when cookie name is absent", () => {
    expect(getImpersonationFromCookie("other=value; foo=bar")).toBeNull();
  });

  it("returns null for malformed JSON", () => {
    const cookieStr = `${IMPERSONATION_COOKIE_NAME}=not-valid-json`;
    expect(getImpersonationFromCookie(cookieStr)).toBeNull();
  });

  it("returns null when sessionId is missing", () => {
    const data = makeImpersonationData();
    const { sessionId: _, ...noSession } = data;
    const cookieStr = `${IMPERSONATION_COOKIE_NAME}=${encodeURIComponent(JSON.stringify(noSession))}`;
    expect(getImpersonationFromCookie(cookieStr)).toBeNull();
  });

  it("returns null when targetUserId is missing", () => {
    const data = makeImpersonationData();
    const { targetUserId: _, ...partial } = data;
    const cookieStr = `${IMPERSONATION_COOKIE_NAME}=${encodeURIComponent(JSON.stringify(partial))}`;
    expect(getImpersonationFromCookie(cookieStr)).toBeNull();
  });

  it("returns null when targetOrgId is missing", () => {
    const data = makeImpersonationData();
    const { targetOrgId: _, ...partial } = data;
    const cookieStr = `${IMPERSONATION_COOKIE_NAME}=${encodeURIComponent(JSON.stringify(partial))}`;
    expect(getImpersonationFromCookie(cookieStr)).toBeNull();
  });

  it("returns null when targetOrgRole is missing", () => {
    const data = makeImpersonationData();
    const { targetOrgRole: _, ...partial } = data;
    const cookieStr = `${IMPERSONATION_COOKIE_NAME}=${encodeURIComponent(JSON.stringify(partial))}`;
    expect(getImpersonationFromCookie(cookieStr)).toBeNull();
  });

  it("returns null when expiresAt is missing", () => {
    const data = makeImpersonationData();
    const { expiresAt: _, ...partial } = data;
    const cookieStr = `${IMPERSONATION_COOKIE_NAME}=${encodeURIComponent(JSON.stringify(partial))}`;
    expect(getImpersonationFromCookie(cookieStr)).toBeNull();
  });

  it("returns null when cookie is expired", () => {
    const data = makeImpersonationData({
      expiresAt: new Date(Date.now() - 1000).toISOString(), // 1s in the past
    });
    const cookieStr = `${IMPERSONATION_COOKIE_NAME}=${encodeURIComponent(JSON.stringify(data))}`;
    expect(getImpersonationFromCookie(cookieStr)).toBeNull();
  });

  it("allows empty display-only fields (targetOrgSlug, targetEmail, targetOrgName)", () => {
    const data = makeImpersonationData({
      targetOrgSlug: "",
      targetEmail: "",
      targetOrgName: "",
    });
    const cookieStr = `${IMPERSONATION_COOKIE_NAME}=${encodeURIComponent(JSON.stringify(data))}`;
    const result = getImpersonationFromCookie(cookieStr);
    expect(result).not.toBeNull();
    expect(result!.sessionId).toBe(data.sessionId);
  });
});

// ── setImpersonationCookie ───────────────────────────────────────────────────

describe("setImpersonationCookie", () => {
  let cookieSetValue = "";

  beforeEach(() => {
    cookieSetValue = "";
    Object.defineProperty(document, "cookie", {
      set: (val: string) => { cookieSetValue = val; },
      get: () => cookieSetValue,
      configurable: true,
    });
  });

  afterEach(() => {
    // Restore default cookie behavior
    delete (document as unknown as Record<string, unknown>).cookie;
  });

  it("sets cookie with correct name, path, and SameSite", () => {
    const data = makeImpersonationData({
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    setImpersonationCookie(data);
    expect(cookieSetValue).toContain(`${IMPERSONATION_COOKIE_NAME}=`);
    expect(cookieSetValue).toContain("path=/");
    expect(cookieSetValue).toContain("SameSite=Lax");
  });

  it("sets max-age=0 for already-expired data", () => {
    const data = makeImpersonationData({
      expiresAt: new Date(Date.now() - 5000).toISOString(),
    });
    setImpersonationCookie(data);
    expect(cookieSetValue).toContain("max-age=0");
  });
});

// ── clearImpersonationCookie ─────────────────────────────────────────────────

describe("clearImpersonationCookie", () => {
  let cookieSetValue = "";

  beforeEach(() => {
    cookieSetValue = "";
    Object.defineProperty(document, "cookie", {
      set: (val: string) => { cookieSetValue = val; },
      get: () => cookieSetValue,
      configurable: true,
    });
  });

  afterEach(() => {
    delete (document as unknown as Record<string, unknown>).cookie;
  });

  it("sets max-age=0 to clear the cookie", () => {
    clearImpersonationCookie();
    expect(cookieSetValue).toContain(`${IMPERSONATION_COOKIE_NAME}=`);
    expect(cookieSetValue).toContain("max-age=0");
  });
});
