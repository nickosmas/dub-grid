import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { validateCsrfOrigin } from "./csrf";

function request(
  origin: string | null,
  options: { url?: string; host?: string; forwardedHost?: string; forwardedProto?: string } = {},
) {
  const headers = new Headers();
  if (origin !== null) headers.set("origin", origin);
  if (options.host) headers.set("host", options.host);
  if (options.forwardedHost) headers.set("x-forwarded-host", options.forwardedHost);
  if (options.forwardedProto) headers.set("x-forwarded-proto", options.forwardedProto);
  return new NextRequest(options.url ?? "https://calmhaven.dubgrid.com/api/example", { headers });
}

function accepted(req: NextRequest): boolean {
  return validateCsrfOrigin(req) === null;
}

afterEach(() => vi.unstubAllEnvs());

describe("validateCsrfOrigin", () => {
  it.each([
    ["exact tenant", "https://calmhaven.dubgrid.com", true],
    ["sibling tenant", "https://ardenwood.dubgrid.com", false],
    ["lookalike suffix", "https://calmhaven.dubgrid.com.attacker.test", false],
    ["scheme downgrade", "http://calmhaven.dubgrid.com", false],
    ["different port", "https://calmhaven.dubgrid.com:444", false],
    ["opaque origin", "null", false],
    ["malformed origin", "not a url", false],
    ["multiple origins", "https://calmhaven.dubgrid.com, https://attacker.test", false],
    ["origin with a path", "https://calmhaven.dubgrid.com/path", false],
  ])("handles %s", (_name, origin, expected) => {
    expect(accepted(request(origin as string))).toBe(expected);
  });

  it("normalizes default ports", () => {
    expect(accepted(request("https://calmhaven.dubgrid.com:443"))).toBe(true);
  });

  it("uses the Host header for tenant-aware local requests", () => {
    expect(
      accepted(
        request("http://calmhaven.localhost:3000", {
          url: "http://localhost:3000/api/example",
          host: "calmhaven.localhost:3000",
        }),
      ),
    ).toBe(true);
  });

  it("fails closed on a missing origin in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const response = validateCsrfOrigin(request(null));
    expect(response?.status).toBe(403);
    await expect(response?.json()).resolves.toMatchObject({ success: false });
  });

  it("permits a missing origin outside production for local tooling", () => {
    vi.stubEnv("NODE_ENV", "test");
    expect(accepted(request(null))).toBe(true);
  });

  it("trusts forwarded endpoint metadata only on Vercel", () => {
    const proxied = request("https://calmhaven.dubgrid.com", {
      url: "http://internal:3000/api/example",
      host: "internal:3000",
      forwardedHost: "calmhaven.dubgrid.com",
      forwardedProto: "https",
    });

    expect(accepted(proxied)).toBe(false);
    vi.stubEnv("NEXT_PUBLIC_VERCEL_URL", "deployment.vercel.app");
    expect(accepted(proxied)).toBe(true);
  });

  it("returns a denial instead of throwing for malformed trusted proxy metadata", () => {
    vi.stubEnv("NEXT_PUBLIC_VERCEL_URL", "deployment.vercel.app");
    expect(
      accepted(
        request("https://calmhaven.dubgrid.com", {
          forwardedHost: "calmhaven.dubgrid.com, attacker.test",
          forwardedProto: "https",
        }),
      ),
    ).toBe(false);
  });
});
