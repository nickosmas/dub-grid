import http from "k6/http";
import { check, sleep } from "k6";
import { scenarios, thresholds, BASE_URL, TEST_EMAILS, TEST_PASSWORD } from "./config.js";

export const options = {
  scenarios: {
    default: scenarios[__ENV.SCENARIO || "smoke"],
  },
  thresholds,
};

export default function authFlow() {
  if (__ITER % 10 === 0) {
    const email = TEST_EMAILS[Math.floor(__ITER / 10) % TEST_EMAILS.length];

    // Login via the API route. This is sampled to avoid tripping brute-force
    // protections while the scenario loops.
    const loginRes = http.post(
      `${BASE_URL}/api/auth/login`,
      JSON.stringify({ email, password: TEST_PASSWORD }),
      {
        headers: { "Content-Type": "application/json", Origin: BASE_URL },
        tags: { type: "write" },
      },
    );

    check(loginRes, {
      "login succeeds": (r) => r.status === 200,
    });

    sleep(0.5);
  }

  // Health endpoint as authenticated user
  const healthRes = http.get(`${BASE_URL}/api/health`);
  check(healthRes, {
    "health 200": (r) => r.status === 200,
  });

  sleep(1);
}
