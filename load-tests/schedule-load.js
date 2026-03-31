import http from "k6/http";
import { check, sleep } from "k6";
import { scenarios, thresholds, BASE_URL } from "./config.js";

export const options = {
  scenarios: {
    default: scenarios[__ENV.SCENARIO || "smoke"],
  },
  thresholds,
};

export default function scheduleLoad() {
  // Health check
  const healthRes = http.get(`${BASE_URL}/api/health`);
  check(healthRes, {
    "health 200": (r) => r.status === 200,
  });

  // Schedule page (static)
  const pageRes = http.get(`${BASE_URL}/schedule`);
  check(pageRes, {
    "schedule page loads": (r) => r.status === 200 || r.status === 302,
  });

  sleep(1);
}
