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
 */

export const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";
export const TEST_EMAIL = __ENV.TEST_EMAIL || "nicodamusalois@gmail.com";
export const TEST_EMAILS = (__ENV.TEST_EMAILS || `${TEST_EMAIL},nicokosmas.dev@gmail.com`)
  .split(",")
  .map((email) => email.trim())
  .filter(Boolean);
export const TEST_PASSWORD = __ENV.TEST_PASSWORD || "password123";

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
  http_req_duration: ["p(95)<500"],      // 95% of reads < 500ms
  http_req_failed: ["rate<0.01"],        // <1% error rate
  "http_req_duration{type:write}": ["p(95)<1000"], // writes < 1s
};
