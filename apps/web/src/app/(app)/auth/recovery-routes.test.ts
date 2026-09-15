import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { exchangeCodeForSession, createServerClient, cookies } = vi.hoisted(() => ({
  exchangeCodeForSession: vi.fn(),
  createServerClient: vi.fn(),
  cookies: vi.fn(),
}));

vi.mock("@supabase/ssr", () => ({ createServerClient }));
vi.mock("next/headers", () => ({ cookies: () => cookies() }));
vi.mock("@/lib/supabase-keys", () => ({
  requireSupabasePublishableKey: () => "publishable-key",
  requireSupabaseUrl: () => "https://project.supabase.co",
}));

import { GET as confirmRecovery } from "./confirm/route";
import { GET as exchangeRecoveryCode } from "./callback/route";

function request(path: string) {
  return new NextRequest(`https://calmhaven.localhost${path}`);
}

describe("web recovery routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cookies.mockResolvedValue({ getAll: () => [], set: vi.fn() });
    createServerClient.mockReturnValue({
      auth: { exchangeCodeForSession },
    });
    exchangeCodeForSession.mockResolvedValue({ error: null });
  });

  it("forwards a recovery token to the scanner-safe interstitial without consuming it", async () => {
    const response = await confirmRecovery(
      request("/auth/confirm?token_hash=recovery-token&type=recovery&next=/reset-password"),
    );

    expect(createServerClient).not.toHaveBeenCalled();
    expect(response.headers.get("location")).toBe(
      "https://calmhaven.localhost/auth/verify?token_hash=recovery-token&type=recovery&next=%2Freset-password",
    );
  });

  it("uses the fixed recovery destination when an external destination is supplied", async () => {
    const response = await confirmRecovery(
      request("/auth/confirm?token_hash=recovery-token&type=recovery&next=https://evil.example"),
    );

    expect(createServerClient).not.toHaveBeenCalled();
    expect(response.headers.get("location")).toBe(
      "https://calmhaven.localhost/auth/verify?token_hash=recovery-token&type=recovery&next=%2Freset-password",
    );
  });

  it("rejects unsupported Auth action types before token consumption", async () => {
    const response = await confirmRecovery(
      request("/auth/confirm?token_hash=signup-token&type=signup&next=/reset-password"),
    );

    expect(createServerClient).not.toHaveBeenCalled();
    expect(response.headers.get("location")).toBe(
      "https://calmhaven.localhost/login?error=invalid_link",
    );
  });

  it("rejects an external PKCE next path after successfully exchanging the code", async () => {
    const response = await exchangeRecoveryCode(
      request("/auth/callback?code=one-time-code&next=//evil.example"),
    );

    expect(exchangeCodeForSession).toHaveBeenCalledWith("one-time-code");
    expect(response.headers.get("location")).toBe("https://calmhaven.localhost/");
  });

  it("preserves an internal PKCE destination query and fragment without retaining the code", async () => {
    const response = await exchangeRecoveryCode(
      request("/auth/callback?code=one-time-code&next=/reset-password%3Ffrom%3Demail%23form"),
    );

    expect(response.headers.get("location")).toBe(
      "https://calmhaven.localhost/reset-password?from=email#form",
    );
    expect(response.headers.get("location")).not.toContain("one-time-code");
  });

  it("returns failed PKCE exchanges to the reset recovery state", async () => {
    exchangeCodeForSession.mockResolvedValue({ error: { message: "expired" } });

    const response = await exchangeRecoveryCode(
      request("/auth/callback?code=expired-code&next=/reset-password"),
    );

    expect(response.headers.get("location")).toBe(
      "https://calmhaven.localhost/reset-password?error=invalid_link",
    );
  });
});
