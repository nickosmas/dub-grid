import { describe, expect, it, vi } from "vitest";
import {
  AUTH_ENTRY_LOG_PREFIX,
  AuthEntryRecorder,
  parseAuthEntryLogLine,
  summarizeAuthEntrySamples,
} from "./auth-entry-measurement";

function completeJourney(
  recorder: AuthEntryRecorder,
  advance: (milliseconds: number) => void,
  journey: "cold_sign_in" | "warm_restore",
) {
  recorder.start(journey);
  advance(100);
  recorder.recordRequest("bootstrap", 80, "total;dur=60, auth;dur=20, secret;dur=999");
  recorder.markStartupGateReady();
  advance(50);
  recorder.markAuthenticatedNavigationReady();
}

describe("AuthEntryRecorder", () => {
  it("does nothing unless explicitly enabled", () => {
    const emit = vi.fn();
    const recorder = new AuthEntryRecorder({ enabled: false, emit });

    recorder.start("cold_sign_in");
    recorder.recordRequest("login", 10, "total;dur=8");
    recorder.markStartupGateReady();
    recorder.markAuthenticatedNavigationReady();

    expect(emit).not.toHaveBeenCalled();
    expect(recorder.getSamples()).toEqual([]);
  });

  it("emits only fixed timing and count fields from allowlisted phases", () => {
    let now = 0;
    const emit = vi.fn();
    const recorder = new AuthEntryRecorder({
      enabled: true,
      emit,
      now: () => now,
      settleDelayMs: 0,
    });

    completeJourney(recorder, (milliseconds) => (now += milliseconds), "cold_sign_in");

    expect(emit).toHaveBeenCalledTimes(1);
    const line = emit.mock.calls[0]?.[0] as string;
    expect(line.startsWith(`${AUTH_ENTRY_LOG_PREFIX} `)).toBe(true);
    expect(line).not.toContain("secret");
    expect(parseAuthEntryLogLine(line)).toEqual({
      schemaVersion: 1,
      journey: "cold_sign_in",
      durationMs: 150,
      phases: {
        bootstrap: 80,
        startup_gate: 100,
        authenticated_navigation: 150,
      },
      requests: { login: 0, bootstrap: 1, session_presence: 0 },
      server: { bootstrap_total: 60, bootstrap_auth: 20 },
    });
    expect(parseAuthEntryLogLine(` INFO  ${line}`)).not.toBeNull();
  });

  it("keeps a bounded in-memory sample buffer", () => {
    let now = 0;
    const recorder = new AuthEntryRecorder({
      enabled: true,
      emit: () => {},
      maxSamples: 2,
      now: () => now,
      settleDelayMs: 0,
    });

    completeJourney(recorder, (milliseconds) => (now += milliseconds), "cold_sign_in");
    completeJourney(recorder, (milliseconds) => (now += milliseconds), "warm_restore");
    completeJourney(recorder, (milliseconds) => (now += milliseconds), "cold_sign_in");

    expect(recorder.getSamples()).toHaveLength(2);
    expect(recorder.getSamples().map((sample) => sample.journey)).toEqual([
      "warm_restore",
      "cold_sign_in",
    ]);
  });
});

describe("auth entry measurement parsing and aggregation", () => {
  it("rejects records containing account, tenant, or arbitrary diagnostic fields", () => {
    expect(
      parseAuthEntryLogLine(
        `${AUTH_ENTRY_LOG_PREFIX} ${JSON.stringify({
          schemaVersion: 1,
          journey: "cold_sign_in",
          durationMs: 1,
          phases: {},
          requests: { login: 1, bootstrap: 1, session_presence: 1 },
          server: {},
          email: "person@example.com",
        })}`,
      ),
    ).toBeNull();
  });

  it("reports median, P95, maximum, phases, and request counts", () => {
    const samples = [100, 200, 500].map((durationMs) => ({
      schemaVersion: 1 as const,
      journey: "warm_restore" as const,
      durationMs,
      phases: { session_restore: durationMs / 2 },
      requests: { login: 0, bootstrap: 1, session_presence: 1 },
      server: { bootstrap_total: durationMs / 4 },
    }));

    expect(summarizeAuthEntrySamples(samples)).toEqual([
      {
        journey: "warm_restore",
        samples: 3,
        durationMs: { median: 200, p95: 500, max: 500 },
        phasesMedianMs: { session_restore: 100 },
        requestsMedian: { login: 0, bootstrap: 1, session_presence: 1 },
        serverMedianMs: { bootstrap_total: 50 },
      },
    ]);
  });
});
