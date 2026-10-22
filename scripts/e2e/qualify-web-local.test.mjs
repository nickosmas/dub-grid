import assert from "node:assert/strict";
import test from "node:test";
import {
  assertThrowawayStack,
  evidenceEntries,
  parseStatusEnv,
  provenRoles,
  summarizeReport,
} from "./qualify-web-local.mjs";

const spec = (file, title, projectName, status) => ({
  file,
  title,
  tests: [{ projectName, status }],
});

const report = {
  suites: [
    {
      title: "landing.spec.ts",
      specs: [spec("landing.spec.ts", "landing renders", "chromium", "expected")],
    },
    {
      title: "role-variance.spec.ts",
      specs: [
        spec("role-variance.spec.ts", "qa-regular (user)", "chromium", "flaky"),
        spec("role-variance.spec.ts", "qa-management (user)", "chromium", "unexpected"),
      ],
    },
    {
      title: "narrow-viewport.spec.ts",
      specs: [
        spec("narrow-viewport.spec.ts", "admin: dashboard fits", "webkit-narrow", "expected"),
        spec("narrow-viewport.spec.ts", "user: dashboard fits", "webkit-narrow", "skipped"),
      ],
    },
  ],
};

test("summarizeReport counts each project and keeps failure and flake titles", () => {
  const summary = summarizeReport(report);
  assert.deepEqual(summary.chromium, {
    passed: 2,
    flaky: 1,
    failed: 1,
    skipped: 0,
    failures: ["role-variance.spec.ts > qa-management (user)"],
    flakes: ["role-variance.spec.ts > qa-regular (user)"],
    roles: ["signed-out", "user"],
  });
  assert.equal(summary["webkit-narrow"].skipped, 1);
  assert.deepEqual(summary["webkit-narrow"].roles, ["admin"]);
});

test("provenRoles needs a test that ran and no failure", () => {
  assert.deepEqual(provenRoles([]), []);
  assert.deepEqual(
    provenRoles([{ file: "role-variance-admin.spec.ts", title: "any", status: "skipped" }]),
    [],
  );
  assert.deepEqual(
    provenRoles([
      { file: "schedule-states.spec.ts", title: "a", status: "expected" },
      { file: "dashboard-states.spec.ts", title: "b", status: "unexpected" },
    ]),
    [],
  );
});

test("evidenceEntries maps projects to a browser and viewport", () => {
  const entries = evidenceEntries(summarizeReport(report), {
    date: "2026-10-22",
    commit: "a".repeat(40),
    environment: "local",
    record: "internal/operations/runtime-qualification/2026-10-22-web.md",
  });
  assert.deepEqual(
    entries.map((entry) => [entry.id, entry.target, entry.viewport, entry.result.failed]),
    [
      ["web-chromium-desktop-2026-10-22", "chromium", "desktop", 1],
      ["web-webkit-narrow-2026-10-22", "webkit", "narrow", 0],
    ],
  );
});

test("assertThrowawayStack refuses the shared stack and remote hosts", () => {
  const status = parseStatusEnv(
    'API_URL="http://127.0.0.1:55321"\nDB_URL="postgresql://postgres:postgres@127.0.0.1:55322/postgres"',
  );
  assert.doesNotThrow(() => assertThrowawayStack(status));
  assert.throws(() => assertThrowawayStack({ ...status, API_URL: "http://127.0.0.1:54321" }));
  assert.throws(() => assertThrowawayStack({ ...status, API_URL: "https://x.supabase.co" }));
});
