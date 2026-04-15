import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetSession = vi.fn();
const mockGetUser = vi.fn();

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: (...args: unknown[]) => mockGetSession(...args),
      getUser: (...args: unknown[]) => mockGetUser(...args),
    },
  },
}));

import {
  getBrowserSession,
  getVerifiedBrowserAuth,
  getVerifiedBrowserUser,
} from "@/lib/browser-auth";

describe("browser auth helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("treats missing-session getUser errors as anonymous visitors", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: {
        name: "AuthSessionMissingError",
        message: "Auth session missing!",
        status: 400,
      },
    });

    await expect(getVerifiedBrowserUser()).resolves.toBeNull();
  });

  it("treats missing-session getSession errors as no session", async () => {
    mockGetSession.mockResolvedValue({
      data: { session: null },
      error: {
        name: "AuthSessionMissingError",
        message: "Auth session missing!",
        status: 400,
      },
    });

    await expect(getBrowserSession()).resolves.toBeNull();
  });

  it("returns a null auth payload when the browser has no session", async () => {
    mockGetSession.mockResolvedValue({
      data: { session: null },
      error: null,
    });
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: {
        name: "AuthSessionMissingError",
        message: "Auth session missing!",
        status: 400,
      },
    });

    await expect(getVerifiedBrowserAuth()).resolves.toEqual({
      session: null,
      user: null,
    });
  });

  it("still rethrows real auth errors", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: new Error("network error"),
    });

    await expect(getVerifiedBrowserUser()).rejects.toThrow("network error");
  });
});
