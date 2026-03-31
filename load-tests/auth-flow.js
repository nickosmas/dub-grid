import http from "k6/http";
import { check, sleep } from "k6";
import { scenarios, thresholds, BASE_URL, TEST_EMAIL, TEST_PASSWORD } from "./config.js";

export const options = {
  scenarios: {
    default: scenarios[__ENV.SCENARIO || "smoke"],
  },
  thresholds,
};

export default function authFlow() {
  // Login via the API route
  const loginRes = http.post(
    `${BASE_URL}/api/auth/login`,
    JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
    { headers: { "Content-Type": "application/json" }, tags: { type: "write" } },
  );

  check(loginRes, {
    "login succeeds": (r) => r.status === 200,
  });

  sleep(0.5);

  // Health endpoint as authenticated user
  const healthRes = http.get(`${BASE_URL}/api/health`);
  check(healthRes, {
    "health 200": (r) => r.status === 200,
  });

  sleep(1);
}
