import { afterEach, describe, expect, it, vi } from "vitest";

const clientEnv: { NEXT_PUBLIC_SITE_URL?: string; NEXT_PUBLIC_VERCEL_URL?: string } = {};

vi.mock("@/lib/env", () => ({ clientEnv }));

describe("emailBaseUrl", () => {
  afterEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    delete clientEnv.NEXT_PUBLIC_SITE_URL;
    delete clientEnv.NEXT_PUBLIC_VERCEL_URL;
  });

  it("prefers the site URL, then the Vercel host", async () => {
    clientEnv.NEXT_PUBLIC_SITE_URL = "https://app.dubgrid.com";
    clientEnv.NEXT_PUBLIC_VERCEL_URL = "preview.vercel.app";
    const { emailBaseUrl } = await import("./email");
    expect(emailBaseUrl()).toBe("https://app.dubgrid.com");

    delete clientEnv.NEXT_PUBLIC_SITE_URL;
    expect(emailBaseUrl()).toBe("https://preview.vercel.app");
  });

  it("falls back to localhost outside production", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const { emailBaseUrl } = await import("./email");
    expect(emailBaseUrl()).toBe("http://localhost:3000");
  });

  // A production deploy with no public origin must fail here, not mail
  // someone a localhost link they cannot open.
  it("refuses to send localhost links in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const { emailBaseUrl } = await import("./email");
    expect(() => emailBaseUrl()).toThrow(/NEXT_PUBLIC_SITE_URL/);
  });
});
