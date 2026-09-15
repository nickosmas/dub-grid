import { describe, expect, it } from "vitest";
import {
  buildAuthEntrySample,
  classifyAuthEntryRequest,
  parseSafeServerTiming,
  summarizeAuthEntrySamples,
} from "./auth-entry-measurement";

describe("auth entry measurement", () => {
  it("reduces tracked URLs to fixed labels without retaining query data", () => {
    const sensitiveUrl =
      "https://calmhaven.localhost/api/organization/bootstrap?email=person%40example.com&token=secret";

    const classification = classifyAuthEntryRequest(sensitiveUrl, "fetch");

    expect(classification).toBe("organization_bootstrap");
    expect(JSON.stringify(classification)).not.toContain("person@example.com");
    expect(JSON.stringify(classification)).not.toContain("secret");
  });

  it("keeps only allowlisted timing names and discards descriptions", () => {
    const timings = parseSafeServerTiming(
      'auth;dur=12.34;desc="user-123", tenant_acme;dur=99, fanout;dur=20.05',
    );

    expect(timings).toEqual({ auth: 12.3, fanout: 20.1 });
    expect(JSON.stringify(timings)).not.toContain("user-123");
    expect(JSON.stringify(timings)).not.toContain("acme");
  });

  it("builds a sanitized sample from request observations", () => {
    const sample = buildAuthEntrySample("cold_sign_in", 1234.56, [
      { kind: "login", serverTiming: "signin;dur=300, total;dur=450" },
      { kind: "organization_bootstrap", serverTiming: "auth;dur=100, fanout;dur=200" },
      { kind: "organization_bootstrap", serverTiming: null },
    ]);

    expect(sample).toEqual({
      journey: "cold_sign_in",
      durationMs: 1234.6,
      requestCounts: { login: 1, organization_bootstrap: 2 },
      serverTimingsMs: {
        "login.signin": 300,
        "login.total": 450,
        "organization_bootstrap.auth": 100,
        "organization_bootstrap.fanout": 200,
      },
    });
  });

  it("summarizes medians and tail observations for both journeys", () => {
    const report = summarizeAuthEntrySamples([
      buildAuthEntrySample("cold_sign_in", 100, [{ kind: "login", serverTiming: null }]),
      buildAuthEntrySample("cold_sign_in", 200, [{ kind: "login", serverTiming: null }]),
      buildAuthEntrySample("cold_sign_in", 900, [
        { kind: "login", serverTiming: null },
        { kind: "login", serverTiming: null },
      ]),
      buildAuthEntrySample("warm_refresh", 80, [
        { kind: "organization_bootstrap", serverTiming: "fanout;dur=40" },
      ]),
    ]);

    expect(report.target).toBe("calmhaven-local");
    expect(report.journeys.cold_sign_in.durationMs).toEqual({ median: 200, p95: 900, max: 900 });
    expect(report.journeys.cold_sign_in.requestCounts.login).toEqual({
      median: 1,
      p95: 2,
      max: 2,
    });
    expect(report.journeys.warm_refresh.serverTimingsMs).toEqual({
      "organization_bootstrap.fanout": { median: 40, p95: 40, max: 40 },
    });
  });

  it("ignores malformed URLs and untracked requests", () => {
    expect(classifyAuthEntryRequest("not a url", "fetch")).toBeNull();
    expect(
      classifyAuthEntryRequest("https://calmhaven.localhost/api/employees", "fetch"),
    ).toBeNull();
    expect(classifyAuthEntryRequest("https://calmhaven.localhost/dashboard", "fetch")).toBeNull();
    expect(classifyAuthEntryRequest("https://calmhaven.localhost/dashboard", "document")).toBe(
      "protected_document",
    );
    expect(
      classifyAuthEntryRequest("https://calmhaven.localhost/dashboard?_rsc=abc123", "fetch"),
    ).toBe("protected_document");
  });
});
