/**
 * k6 load test shared config.
 * Usage: k6 run load-tests/schedule-load.js
 *
 * Requires k6 installed separately: https://k6.io/docs/getting-started/installation/
 *
 * Environment variables:
 *   BASE_URL  — target URL (default http://localhost:3000)
 *   TEST_EMAIL — auth email
 *   TEST_EMAILS — comma-separated auth emails, used before TEST_EMAIL
 *   TEST_PASSWORD — auth password
 *   TEST_ORG_ID — organization the authenticated scenarios read and write
 *   SCHEDULE_AUTH — "1" to include the authenticated schedule scenario
 */

export const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";
const isLocalTarget = /^https?:\/\/([\w-]+\.)*(localhost|127\.0\.0\.1)(?::\d+)?$/.test(BASE_URL);
// The seeded QA account, never a person's own login: an unconfigured run
// would otherwise authenticate as whoever this default named, against
// whatever BASE_URL points at.
export const TEST_EMAIL = __ENV.TEST_EMAIL || "qa-super-admin@dubgrid.test";
export const TEST_EMAILS = (__ENV.TEST_EMAILS || TEST_EMAIL)
  .split(",")
  .map((email) => email.trim())
  .filter(Boolean);
export const TEST_PASSWORD = __ENV.TEST_PASSWORD || "password123";

/** Calm Haven in the seed; any organization the accounts above belong to. */
export const TEST_ORG_ID = __ENV.TEST_ORG_ID || "b7c335a0-6218-4f4e-9a82-1d5f7c8e2b90";

export const IS_LOCAL_TARGET = isLocalTarget;

/**
 * A run against anything but localhost must name its own credentials. The
 * seeded defaults exist for the local stack; pointed at staging they would
 * either fail confusingly or, worse, find an account with the same address.
 */
export function assertCredentialsConfigured() {
  if (isLocalTarget) return;
  if (!__ENV.TEST_EMAIL && !__ENV.TEST_EMAILS) {
    throw new Error(
      `Refusing to run against ${BASE_URL} with the seeded local credentials. ` +
        "Set TEST_EMAIL or TEST_EMAILS (and TEST_PASSWORD) for this target.",
    );
  }
}

export const scenarios = {
  smoke: {
    executor: "constant-vus",
    vus: 1,
    duration: "30s",
  },
  load: {
    executor: "ramping-vus",
    startVUs: 0,
    stages: [
      { duration: "30s", target: 20 },
      { duration: "1m", target: 50 },
      { duration: "30s", target: 50 },
      { duration: "30s", target: 0 },
    ],
  },
  stress: {
    executor: "ramping-vus",
    startVUs: 0,
    stages: [
      { duration: "30s", target: 50 },
      { duration: "1m", target: 200 },
      { duration: "1m", target: 200 },
      { duration: "30s", target: 0 },
    ],
  },
};

export const thresholds = {
  // Authenticated schedule work is tagged so its reads and writes are judged
  // apart from the public pages, which is what the launch numbers are about.
  "http_req_duration{type:schedule_read}": [isLocalTarget ? "p(95)<3000" : "p(95)<800"],
  "http_req_duration{type:schedule_write}": [isLocalTarget ? "p(95)<3000" : "p(95)<1200"],
  "http_req_failed{type:schedule_read}": ["rate<0.01"],
  "http_req_failed{type:schedule_write}": ["rate<0.01"],
  // Local full-stack requests include the developer machine and local Supabase.
  // Keep a bounded smoke budget there; deployed targets retain the tighter SLA.
  http_req_duration: [isLocalTarget ? "p(95)<2000" : "p(95)<500"],
  http_req_failed: ["rate<0.01"], // <1% error rate
  "http_req_duration{type:write}": [isLocalTarget ? "p(95)<2000" : "p(95)<1000"],
};
