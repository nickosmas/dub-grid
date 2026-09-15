export const AUTH_ENTRY_LOG_PREFIX = "[dubgrid-auth-entry]";

export type AuthEntryJourney = "cold_sign_in" | "warm_restore";
export type AuthEntryRequestKind = "login" | "bootstrap" | "session_presence";
export type AuthEntryClientPhase =
  | "session_restore"
  | "credential_login"
  | "session_handoff"
  | "bootstrap"
  | "session_presence"
  | "startup_gate"
  | "authenticated_navigation";

type AuthEntryServerPhase =
  | "login_total"
  | "login_rate_limit"
  | "login_login_flow"
  | "bootstrap_total"
  | "bootstrap_auth"
  | "bootstrap_fanout";

export type AuthEntrySample = {
  schemaVersion: 1;
  journey: AuthEntryJourney;
  durationMs: number;
  phases: Partial<Record<AuthEntryClientPhase, number>>;
  requests: Record<AuthEntryRequestKind, number>;
  server: Partial<Record<AuthEntryServerPhase, number>>;
};

type ActiveJourney = {
  journey: AuthEntryJourney;
  startedAt: number;
  phases: Partial<Record<AuthEntryClientPhase, number>>;
  requests: Record<AuthEntryRequestKind, number>;
  server: Partial<Record<AuthEntryServerPhase, number>>;
  startupGateReady: boolean;
  authenticatedNavigationReady: boolean;
  finishScheduled: boolean;
};

type RecorderOptions = {
  enabled: boolean;
  now?: () => number;
  emit?: (line: string) => void;
  maxSamples?: number;
  settleDelayMs?: number;
};

const SERVER_PHASES_BY_REQUEST: Record<
  AuthEntryRequestKind,
  Partial<Record<string, AuthEntryServerPhase>>
> = {
  login: {
    total: "login_total",
    rate_limit: "login_rate_limit",
    login_flow: "login_login_flow",
  },
  bootstrap: {
    total: "bootstrap_total",
    auth: "bootstrap_auth",
    fanout: "bootstrap_fanout",
  },
  session_presence: {},
};

const REQUEST_PHASES: Record<AuthEntryRequestKind, AuthEntryClientPhase> = {
  login: "credential_login",
  bootstrap: "bootstrap",
  session_presence: "session_presence",
};

const JOURNEYS = ["cold_sign_in", "warm_restore"] as const;
const CLIENT_PHASES = [
  "session_restore",
  "credential_login",
  "session_handoff",
  "bootstrap",
  "session_presence",
  "startup_gate",
  "authenticated_navigation",
] as const;
const REQUEST_KINDS = ["login", "bootstrap", "session_presence"] as const;
const SERVER_PHASES = [
  "login_total",
  "login_rate_limit",
  "login_login_flow",
  "bootstrap_total",
  "bootstrap_auth",
  "bootstrap_fanout",
] as const;

function roundDuration(value: number): number {
  return Math.max(0, Math.round(value * 10) / 10);
}

function percentile(values: number[], fraction: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.max(0, Math.ceil(sorted.length * fraction) - 1);
  return roundDuration(sorted[index] ?? 0);
}

export function summarizeAuthEntrySamples(samples: AuthEntrySample[]) {
  return (["cold_sign_in", "warm_restore"] as const).flatMap((journey) => {
    const matching = samples.filter((sample) => sample.journey === journey);
    if (matching.length === 0) return [];

    const durations = matching.map((sample) => sample.durationMs);
    const phaseNames = Array.from(
      new Set(matching.flatMap((sample) => Object.keys(sample.phases))),
    ) as AuthEntryClientPhase[];
    const serverNames = Array.from(
      new Set(matching.flatMap((sample) => Object.keys(sample.server))),
    ) as AuthEntryServerPhase[];

    return [
      {
        journey,
        samples: matching.length,
        durationMs: {
          median: percentile(durations, 0.5),
          p95: percentile(durations, 0.95),
          max: roundDuration(Math.max(...durations)),
        },
        phasesMedianMs: Object.fromEntries(
          phaseNames.map((name) => [
            name,
            percentile(
              matching.flatMap((sample) =>
                sample.phases[name] === undefined ? [] : [sample.phases[name]],
              ),
              0.5,
            ),
          ]),
        ),
        requestsMedian: Object.fromEntries(
          (["login", "bootstrap", "session_presence"] as const).map((name) => [
            name,
            percentile(
              matching.map((sample) => sample.requests[name]),
              0.5,
            ),
          ]),
        ),
        serverMedianMs: Object.fromEntries(
          serverNames.map((name) => [
            name,
            percentile(
              matching.flatMap((sample) =>
                sample.server[name] === undefined ? [] : [sample.server[name]],
              ),
              0.5,
            ),
          ]),
        ),
      },
    ];
  });
}

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).every((key) => keys.includes(key));
}

function parseDurationRecord<T extends string>(
  value: unknown,
  allowedKeys: readonly T[],
): Partial<Record<T, number>> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (!hasOnlyKeys(record, allowedKeys)) return null;

  const parsed: Partial<Record<T, number>> = {};
  for (const [key, duration] of Object.entries(record)) {
    if (typeof duration !== "number" || !Number.isFinite(duration) || duration < 0) return null;
    parsed[key as T] = roundDuration(duration);
  }
  return parsed;
}

export function parseAuthEntryLogLine(line: string): AuthEntrySample | null {
  const prefixIndex = line.indexOf(`${AUTH_ENTRY_LOG_PREFIX} `);
  if (prefixIndex === -1) return null;

  let value: unknown;
  try {
    value = JSON.parse(line.slice(prefixIndex + AUTH_ENTRY_LOG_PREFIX.length + 1));
  } catch {
    return null;
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (
    !hasOnlyKeys(record, [
      "schemaVersion",
      "journey",
      "durationMs",
      "phases",
      "requests",
      "server",
    ]) ||
    record.schemaVersion !== 1 ||
    !JOURNEYS.includes(record.journey as AuthEntryJourney) ||
    typeof record.durationMs !== "number" ||
    !Number.isFinite(record.durationMs) ||
    record.durationMs < 0
  ) {
    return null;
  }

  const phases = parseDurationRecord(record.phases, CLIENT_PHASES);
  const requests = parseDurationRecord(record.requests, REQUEST_KINDS);
  const server = parseDurationRecord(record.server, SERVER_PHASES);
  if (!phases || !requests || !server || REQUEST_KINDS.some((key) => requests[key] === undefined)) {
    return null;
  }

  return {
    schemaVersion: 1,
    journey: record.journey as AuthEntryJourney,
    durationMs: roundDuration(record.durationMs),
    phases,
    requests: requests as Record<AuthEntryRequestKind, number>,
    server,
  };
}

export class AuthEntryRecorder {
  private readonly enabled: boolean;
  private readonly now: () => number;
  private readonly emit: (line: string) => void;
  private readonly maxSamples: number;
  private readonly settleDelayMs: number;
  private readonly samples: AuthEntrySample[] = [];
  private active: ActiveJourney | null = null;
  private startupGateReady = false;

  constructor(options: RecorderOptions) {
    this.enabled = options.enabled;
    this.now = options.now ?? (() => globalThis.performance?.now() ?? Date.now());
    this.emit = options.emit ?? console.info;
    this.maxSamples = Math.max(1, Math.floor(options.maxSamples ?? 12));
    this.settleDelayMs = Math.max(0, options.settleDelayMs ?? 250);
  }

  start(journey: AuthEntryJourney): void {
    if (!this.enabled) return;
    this.active = {
      journey,
      startedAt: this.now(),
      phases: {},
      requests: { login: 0, bootstrap: 0, session_presence: 0 },
      server: {},
      startupGateReady: this.startupGateReady,
      authenticatedNavigationReady: false,
      finishScheduled: false,
    };
  }

  cancel(journey?: AuthEntryJourney): void {
    if (!this.active || (journey && this.active.journey !== journey)) return;
    this.active = null;
  }

  startPhase(phase: AuthEntryClientPhase): () => void {
    if (!this.enabled || !this.active) return () => {};
    const journey = this.active;
    const startedAt = this.now();
    return () => {
      if (this.active !== journey) return;
      journey.phases[phase] = roundDuration(
        (journey.phases[phase] ?? 0) + (this.now() - startedAt),
      );
    };
  }

  recordRequest(
    request: AuthEntryRequestKind,
    durationMs: number,
    serverTiming: string | null,
  ): void {
    if (!this.enabled || !this.active) return;
    this.active.requests[request] += 1;
    const phase = REQUEST_PHASES[request];
    this.active.phases[phase] = roundDuration((this.active.phases[phase] ?? 0) + durationMs);

    const allowlist = SERVER_PHASES_BY_REQUEST[request];
    for (const entry of serverTiming?.split(",") ?? []) {
      const [rawName, ...parameters] = entry.trim().split(";");
      const name = allowlist[rawName];
      if (!name) continue;
      const durationParameter = parameters.find((parameter) => parameter.trim().startsWith("dur="));
      const duration = Number(durationParameter?.trim().slice(4));
      if (!Number.isFinite(duration)) continue;
      this.active.server[name] = roundDuration((this.active.server[name] ?? 0) + duration);
    }
  }

  markStartupGateReady(): void {
    this.startupGateReady = true;
    if (!this.active) return;
    this.active.startupGateReady = true;
    this.active.phases.startup_gate = roundDuration(this.now() - this.active.startedAt);
    this.maybeFinish();
  }

  markAuthenticatedNavigationReady(journey?: AuthEntryJourney): void {
    if (!this.active || (journey && this.active.journey !== journey)) return;
    this.active.authenticatedNavigationReady = true;
    this.active.phases.authenticated_navigation = roundDuration(this.now() - this.active.startedAt);
    this.maybeFinish();
  }

  getSamples(): AuthEntrySample[] {
    return this.samples.map((sample) => ({
      ...sample,
      phases: { ...sample.phases },
      requests: { ...sample.requests },
      server: { ...sample.server },
    }));
  }

  private maybeFinish(): void {
    if (
      !this.active ||
      !this.active.startupGateReady ||
      !this.active.authenticatedNavigationReady ||
      this.active.finishScheduled
    ) {
      return;
    }

    const active = this.active;
    const durationMs = roundDuration(this.now() - active.startedAt);
    active.finishScheduled = true;
    const finish = () => this.finish(active, durationMs);
    if (this.settleDelayMs === 0) {
      finish();
    } else {
      setTimeout(finish, this.settleDelayMs);
    }
  }

  private finish(active: ActiveJourney, durationMs: number): void {
    if (this.active !== active) return;
    const sample: AuthEntrySample = {
      schemaVersion: 1,
      journey: active.journey,
      durationMs,
      phases: { ...active.phases },
      requests: { ...active.requests },
      server: { ...active.server },
    };

    this.samples.push(sample);
    if (this.samples.length > this.maxSamples) {
      this.samples.splice(0, this.samples.length - this.maxSamples);
    }
    this.active = null;
    this.emit(`${AUTH_ENTRY_LOG_PREFIX} ${JSON.stringify(sample)}`);
  }
}

declare const __DEV__: boolean;

function isDevelopmentMeasurementEnabled(): boolean {
  const isDevBuild = typeof __DEV__ !== "undefined" && __DEV__;
  return isDevBuild && process.env.EXPO_PUBLIC_AUTH_ENTRY_MEASUREMENT === "1";
}

export const authEntryRecorder = new AuthEntryRecorder({
  enabled: isDevelopmentMeasurementEnabled(),
});

export function markMobileAuthRuntimeStarted(): void {
  authEntryRecorder.start("warm_restore");
}
