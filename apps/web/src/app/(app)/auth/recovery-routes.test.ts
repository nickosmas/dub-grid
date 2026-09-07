import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { verifyOtp, exchangeCodeForSession, createServerClient, cookies } = vi.hoisted(() => ({
  verifyOtp: vi.fn(),
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
      auth: { verifyOtp, exchangeCodeForSession },
    });
    verifyOtp.mockResolvedValue({ error: null });
    exchangeCodeForSession.mockResolvedValue({ error: null });
  });

  it("confirms a recovery token and redirects only to its relative reset target", async () => {
    const response = await confirmRecovery(
      request("/auth/confirm?token_hash=recovery-token&type=recovery&next=/reset-password"),
    );

    expect(verifyOtp).toHaveBeenCalledWith({ type: "recovery", token_hash: "recovery-token" });
    expect(response.headers.get("location")).toBe("https://calmhaven.localhost/reset-password");
  });

  it("rejects an external confirmation redirect even after a valid recovery token", async () => {
    const response = await confirmRecovery(
      request("/auth/confirm?token_hash=recovery-token&type=recovery&next=https://evil.example"),
    );

    expect(response.headers.get("location")).toBe("https://calmhaven.localhost/");
  });

  it("sends invalid recovery links to the reset recovery state without retaining the token", async () => {
    verifyOtp.mockResolvedValue({ error: { message: "expired" } });

    const response = await confirmRecovery(
      request("/auth/confirm?token_hash=expired-token&type=recovery&next=/reset-password"),
    );

    expect(response.headers.get("location")).toBe(
      "https://calmhaven.localhost/reset-password?error=invalid_link",
    );
  });

  it("rejects an external PKCE next path after successfully exchanging the code", async () => {
    const response = await exchangeRecoveryCode(
      request("/auth/callback?code=one-time-code&next=//evil.example"),
    );

    expect(exchangeCodeForSession).toHaveBeenCalledWith("one-time-code");
    expect(response.headers.get("location")).toBe("https://calmhaven.localhost/");
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
