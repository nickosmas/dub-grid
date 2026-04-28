import { afterEach, describe, expect, it, vi } from "vitest";
import { isLoopbackHost, isPrivateIpv4Host, validateMobileEnv } from "./env";

describe("mobile env validation", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("flags missing required Expo mobile env vars", () => {
    vi.stubEnv("EXPO_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("EXPO_PUBLIC_SUPABASE_ANON_KEY", "");
    vi.stubEnv("EXPO_PUBLIC_API_BASE_URL", "");

    const result = validateMobileEnv("ios");

    expect(result.status).toBe("invalid");
    if (result.status !== "invalid") {
      throw new Error("Expected invalid mobile env state");
    }

    expect(result.issues.map((issue) => issue.key)).toEqual([
      "EXPO_PUBLIC_SUPABASE_URL",
      "EXPO_PUBLIC_SUPABASE_ANON_KEY",
      "EXPO_PUBLIC_API_BASE_URL",
    ]);
  });

  it("rejects loopback URLs on native devices", () => {
    vi.stubEnv("EXPO_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
    vi.stubEnv("EXPO_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
    vi.stubEnv("EXPO_PUBLIC_API_BASE_URL", "http://localhost:3000");

    const result = validateMobileEnv("ios");

    expect(result.status).toBe("invalid");
    if (result.status !== "invalid") {
      throw new Error("Expected invalid mobile env state");
    }

    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "EXPO_PUBLIC_SUPABASE_URL",
        }),
        expect.objectContaining({
          key: "EXPO_PUBLIC_API_BASE_URL",
        }),
      ]),
    );
  });

  it("allows hosted URLs for Expo Go on a phone", () => {
    vi.stubEnv(
      "EXPO_PUBLIC_SUPABASE_URL",
      "https://example-project.supabase.co",
    );
    vi.stubEnv("EXPO_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
    vi.stubEnv("EXPO_PUBLIC_API_BASE_URL", "https://dubgrid.com/");

    expect(validateMobileEnv("ios")).toEqual({
      status: "ready",
      config: {
        supabaseUrl: "https://example-project.supabase.co",
        supabaseAnonKey: "anon-key",
        apiBaseUrl: "https://dubgrid.com",
      },
    });
  });

  it("rejects a local API mixed with hosted Supabase", () => {
    vi.stubEnv(
      "EXPO_PUBLIC_SUPABASE_URL",
      "https://example-project.supabase.co",
    );
    vi.stubEnv("EXPO_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
    vi.stubEnv("EXPO_PUBLIC_API_BASE_URL", "http://192.168.1.25:3000");

    const result = validateMobileEnv("ios");

    expect(result.status).toBe("invalid");
    if (result.status !== "invalid") {
      throw new Error("Expected invalid mobile env state");
    }

    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "EXPO_PUBLIC_SUPABASE_URL",
        }),
      ]),
    );
  });

  it("rejects local Supabase mixed with the hosted DubGrid API", () => {
    vi.stubEnv("EXPO_PUBLIC_SUPABASE_URL", "http://192.168.1.25:54321");
    vi.stubEnv("EXPO_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
    vi.stubEnv("EXPO_PUBLIC_API_BASE_URL", "https://dubgrid.com");

    const result = validateMobileEnv("ios");

    expect(result.status).toBe("invalid");
    if (result.status !== "invalid") {
      throw new Error("Expected invalid mobile env state");
    }

    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "EXPO_PUBLIC_API_BASE_URL",
        }),
      ]),
    );
  });

  it("detects known loopback hosts", () => {
    expect(isLoopbackHost("localhost")).toBe(true);
    expect(isLoopbackHost("127.0.0.1")).toBe(true);
    expect(isLoopbackHost("0.0.0.0")).toBe(true);
    expect(isLoopbackHost("dubgrid.com")).toBe(false);
  });

  it("detects private LAN IPv4 hosts", () => {
    expect(isPrivateIpv4Host("192.168.1.10")).toBe(true);
    expect(isPrivateIpv4Host("10.0.0.5")).toBe(true);
    expect(isPrivateIpv4Host("172.20.10.2")).toBe(true);
    expect(isPrivateIpv4Host("8.8.8.8")).toBe(false);
  });
});
