import { describe, expect, it } from "vitest";

import { localSupabaseConnectSources } from "./local-supabase-csp";

describe("localSupabaseConnectSources", () => {
  it("allows the shared local stack exactly as before", () => {
    expect(localSupabaseConnectSources("http://127.0.0.1:54321")).toBe(
      "http://127.0.0.1:54321 ws://127.0.0.1:54321 http://localhost:54321 ws://localhost:54321",
    );
  });

  it("follows a local stack on another port", () => {
    expect(localSupabaseConnectSources("http://localhost:55321")).toBe(
      "http://127.0.0.1:55321 ws://127.0.0.1:55321 http://localhost:55321 ws://localhost:55321",
    );
  });

  it("adds nothing for a hosted project or a missing URL", () => {
    expect(localSupabaseConnectSources("https://abcdefgh.supabase.co")).toBe("");
    expect(localSupabaseConnectSources("http://127.0.0.1.example.com:54321")).toBe("");
    expect(localSupabaseConnectSources(undefined)).toBe("");
  });
});
