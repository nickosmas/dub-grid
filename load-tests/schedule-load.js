import http from "k6/http";
import { check, sleep } from "k6";
import {
  assertCredentialsConfigured,
  scenarios,
  thresholds,
  BASE_URL,
  TEST_EMAILS,
  TEST_ORG_ID,
  TEST_PASSWORD,
} from "./config.js";

/**
 * Schedule load.
 *
 * The public half (health, the schedule route) says whether the app is up.
 * The authenticated half is the one the launch numbers are about: it signs
 * in, reads a schedule window, writes a draft cell with its expected
 * version, and reads it back, tagged so reads and writes are judged apart.
 *
 * Enable it with SCHEDULE_AUTH=1. It is off by default so the smoke run
 * stays read-only and safe to point at anything.
 */
const AUTHENTICATED = __ENV.SCHEDULE_AUTH === "1";

/** Per-VU, set on the first iteration and reused by the rest. */
let sessionToken = null;
const WEEK_START = __ENV.SCHEDULE_START || "2026-09-20";
const WEEK_END = __ENV.SCHEDULE_END || "2026-09-26";

export const options = {
  scenarios: {
    default: scenarios[__ENV.SCENARIO || "smoke"],
  },
  thresholds,
};

export function setup() {
  if (!AUTHENTICATED) return { enabled: false };
  assertCredentialsConfigured();
  return { enabled: true };
}

/**
 * The login route answers with the session in its body, the way the browser
 * client consumes it, and sets no cookie of its own, so the scenarios carry
 * the access token as a bearer the way the mobile client does.
 */
function signIn() {
  const email = TEST_EMAILS[__VU % TEST_EMAILS.length];
  const res = http.post(
    `${BASE_URL}/api/auth/login`,
    JSON.stringify({ email, password: TEST_PASSWORD }),
    {
      headers: { "Content-Type": "application/json", Origin: BASE_URL },
      tags: { type: "schedule_write" },
    },
  );
  const ok = check(res, { "login succeeds": (r) => r.status === 200 });
  if (!ok) return null;
  const token = res.json("session.access_token");
  check(res, { "login returns a session": () => typeof token === "string" && token.length > 0 });
  return typeof token === "string" ? token : null;
}

function scheduleRequest(token, body, tag) {
  return http.post(`${BASE_URL}/api/schedule/manage`, JSON.stringify(body), {
    headers: {
      "Content-Type": "application/json",
      Origin: BASE_URL,
      Authorization: `Bearer ${token}`,
    },
    tags: { type: tag },
  });
}

function readWindow(token) {
  const res = scheduleRequest(
    token,
    {
      action: "fetchShifts",
      orgId: TEST_ORG_ID,
      isScheduler: true,
      startDate: WEEK_START,
      endDate: WEEK_END,
      assignmentLabels: [],
      absenceTypeLabels: [],
    },
    "schedule_read",
  );
  check(res, {
    "schedule window reads": (r) => r.status === 200,
    "schedule window is a map": (r) => r.status === 200 && typeof r.json("shifts") === "object",
  });
  return res.status === 200 ? res.json("shifts") : null;
}

function readNotes(token) {
  const res = scheduleRequest(
    token,
    {
      action: "fetchScheduleNotes",
      orgId: TEST_ORG_ID,
      startDate: WEEK_START,
      endDate: WEEK_END,
    },
    "schedule_read",
  );
  check(res, { "schedule notes read": (r) => r.status === 200 });
}

export default function scheduleLoad(data) {
  const healthRes = http.get(`${BASE_URL}/api/health`);
  check(healthRes, { "health 200": (r) => r.status === 200 });

  const pageRes = http.get(`${BASE_URL}/schedule`);
  check(pageRes, { "schedule page loads": (r) => r.status === 200 || r.status === 302 });

  if (!data || !data.enabled) {
    sleep(1);
    return;
  }

  // One sign-in per VU, reused across iterations: repeating it every loop
  // measures the auth endpoint rather than the schedule, and trips the
  // brute-force guard on a deployed target.
  if (__ITER === 0) {
    sessionToken = signIn();
  }
  if (!sessionToken) {
    sleep(1);
    return;
  }

  const shifts = readWindow(sessionToken);
  readNotes(sessionToken);

  // A versioned write on a cell the read just returned, so the optimistic
  // lock is exercised rather than avoided. Read-only runs skip it.
  if (shifts && __ENV.SCHEDULE_WRITE === "1") {
    const key = Object.keys(shifts)[0];
    if (key) {
      const [empId, date] = key.split("_");
      const res = scheduleRequest(
        sessionToken,
        {
          action: "deleteShift",
          orgId: TEST_ORG_ID,
          employeeId: empId,
          date,
          expectedVersion: shifts[key].version,
        },
        "schedule_write",
      );
      check(res, {
        "versioned write is accepted or refused cleanly": (r) =>
          r.status === 200 || r.status === 409,
      });
    }
  }

  sleep(1);
}
