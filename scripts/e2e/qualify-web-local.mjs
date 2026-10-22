#!/usr/bin/env node
// Runs the web role and state matrix (40e3) against a throwaway seeded stack
// through the production E2E runner, then sums the JSON report per project.
//
//   E2E_STACK_WORKDIR=<rehearsal workdir> \
//   E2E_UPSTASH_REDIS_REST_URL=... E2E_UPSTASH_REDIS_REST_TOKEN=... \
//   node scripts/e2e/qualify-web-local.mjs <summary.json> [playwright args]
//
// After triage, write the manifest's runtimeEvidence from the summary:
//
//   node scripts/e2e/qualify-web-local.mjs --record <summary.json> <dated record> [commit]
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const SHARED_API_PORT = "54321";
const SHARED_DB_PORT = "54322";

export function parseStatusEnv(text) {
  const values = {};
  for (const line of text.split("\n")) {
    const match = /^([A-Z0-9_]+)="?(.*?)"?$/.exec(line.trim());
    if (match) values[match[1]] = match[2];
  }
  return values;
}

/** Refuses anything but a loopback stack on its own ports: the shared stack is never used. */
export function assertThrowawayStack(status) {
  const api = new URL(status.API_URL ?? "");
  const db = new URL(status.DB_URL ?? "");
  if (
    !["127.0.0.1", "localhost"].includes(api.hostname) ||
    !["127.0.0.1", "localhost"].includes(db.hostname)
  ) {
    throw new Error("The E2E stack must be local.");
  }
  if (api.port === SHARED_API_PORT || db.port === SHARED_DB_PORT) {
    throw new Error(
      "Refusing the shared local stack; start a throwaway one with db:migrations:rehearse --seeded.",
    );
  }
}

// Which tests prove a role: the role specs, the narrow tests by their title
// prefix, and the state specs, which sign in as the super admin.
const ROLE_EVIDENCE = {
  "signed-out": { files: ["landing.spec.ts", "login.spec.ts"], narrow: /^signed out:/ },
  user: { files: ["role-variance.spec.ts"], title: /qa-regular/, narrow: /^user:/ },
  "management-only-user": {
    files: ["role-variance.spec.ts"],
    title: /qa-management/,
    narrow: /^management-only user:/,
  },
  "limited-admin": { files: ["role-variance-limited-admin.spec.ts"] },
  admin: { files: ["role-variance-admin.spec.ts"], narrow: /^admin:/ },
  "super-admin": {
    files: ["schedule-states.spec.ts", "dashboard-states.spec.ts", "settings-states.spec.ts"],
    narrow: /^super admin:/,
  },
};

/** The roles a project proved: at least one matching test ran and none failed. */
export function provenRoles(tests) {
  return Object.entries(ROLE_EVIDENCE)
    .filter(([, rule]) => {
      const matching = tests.filter((test) =>
        test.file === "narrow-viewport.spec.ts"
          ? Boolean(rule.narrow?.test(test.title))
          : rule.files.includes(test.file) && (!rule.title || rule.title.test(test.title)),
      );
      const ran = matching.filter((test) => test.status !== "skipped");
      return ran.length > 0 && ran.every((test) => test.status !== "unexpected");
    })
    .map(([role]) => role);
}

/** Per Playwright project: passed, flaky (passed on a retry), failed, skipped, titles and roles. */
export function summarizeReport(report) {
  const projects = {};
  const tests = {};
  const walk = (suite, titles) => {
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests ?? []) {
        const project = (projects[test.projectName] ??= {
          passed: 0,
          flaky: 0,
          failed: 0,
          skipped: 0,
          failures: [],
          flakes: [],
          roles: [],
        });
        (tests[test.projectName] ??= []).push({
          file: (spec.file ?? "").split("/").pop(),
          title: spec.title,
          status: test.status,
        });
        const title = [...titles, spec.title].filter(Boolean).join(" > ");
        if (test.status === "skipped") project.skipped += 1;
        else if (test.status === "unexpected") {
          project.failed += 1;
          project.failures.push(title);
        } else {
          project.passed += 1;
          if (test.status === "flaky") {
            project.flaky += 1;
            project.flakes.push(title);
          }
        }
      }
    }
    for (const child of suite.suites ?? []) walk(child, [...titles, child.title]);
  };
  for (const suite of report.suites ?? []) walk(suite, [suite.title]);
  for (const [name, project] of Object.entries(projects)) project.roles = provenRoles(tests[name]);
  return projects;
}

/** One manifest entry per project: `chromium` is desktop, `chromium-narrow` is narrow. */
export function evidenceEntries(summary, { date, commit, environment, record }) {
  return Object.entries(summary).map(([project, counts]) => {
    const [target, kind] = project.split("-");
    const viewport = kind === "narrow" ? "narrow" : "desktop";
    return {
      id: `web-${target}-${viewport}-${date}`,
      platform: "web",
      target,
      viewport,
      roles: counts.roles,
      states: [],
      recordedAt: date,
      commit,
      environment,
      result: { passed: counts.passed, failed: counts.failed, skipped: counts.skipped },
      record,
    };
  });
}

/** Writes the entries into the manifest, replacing any with the same id. */
function writeManifestEntries(entries) {
  const manifestPath = resolve("internal/documentation/accuracy-manifest.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const ids = new Set(entries.map((entry) => entry.id));
  const kept = (manifest.runtimeEvidence ?? []).filter((entry) => !ids.has(entry.id));
  const next = { ...manifest, runtimeEvidence: [...kept, ...entries] };
  writeFileSync(manifestPath, `${JSON.stringify(next, null, 2)}\n`);
}

function record() {
  // The commit the suite ran at, which can be behind HEAD once the record is written.
  const [, summaryPath, recordPath, ranAt = "HEAD"] = process.argv.slice(2);
  const summary = JSON.parse(readFileSync(summaryPath, "utf8"));
  const commit = execFileSync("git", ["rev-parse", ranAt], { encoding: "utf8" }).trim();
  const date = /(\d{4}-\d{2}-\d{2})/.exec(recordPath)?.[1];
  if (!date || !existsSync(resolve(recordPath))) {
    throw new Error("Usage: --record <summary.json> <existing dated record> [commit]");
  }
  const environment =
    "Local throwaway Supabase stack seeded by db:migrations:rehearse, production build through run-production-e2e, local Upstash emulator, CI's variables only";
  writeManifestEntries(evidenceEntries(summary, { date, commit, environment, record: recordPath }));
}

function main() {
  if (process.argv[2] === "--record") {
    record();
    return;
  }
  const [summaryPath, ...playwrightArgs] = process.argv.slice(2);
  const workdir = process.env.E2E_STACK_WORKDIR;
  if (!summaryPath || !workdir) {
    throw new Error(
      "Usage: E2E_STACK_WORKDIR=<dir> node scripts/e2e/qualify-web-local.mjs <summary.json> [args]",
    );
  }
  const status = parseStatusEnv(
    execFileSync("npx", ["supabase", "status", "--workdir", workdir, "-o", "env"], {
      encoding: "utf8",
    }),
  );
  assertThrowawayStack(status);
  const reportPath = resolve(`${summaryPath}.report.json`);
  // The same environment CI builds with: no local settings file, so no
  // email, error reporting or other service is configured.
  if (existsSync(resolve("apps/web/.env.local"))) {
    throw new Error(
      "Move apps/web/.env.local aside first; the run uses only the variables CI sets.",
    );
  }
  const port = process.env.E2E_PRODUCTION_PORT ?? "3002";
  const env = {
    ...process.env,
    NEXT_PUBLIC_SUPABASE_URL: status.API_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: status.ANON_KEY,
    SUPABASE_SECRET_KEY: status.SERVICE_ROLE_KEY,
    NEXT_PUBLIC_SITE_URL: `http://localhost:${port}`,
    NEXT_PUBLIC_BASE_DOMAIN: "localhost",
    LOCAL_SUPABASE_URL: status.API_URL,
    LOCAL_SUPABASE_ANON_KEY: status.ANON_KEY,
    LOCAL_SUPABASE_DB_URL: status.DB_URL,
    PLAYWRIGHT_JSON_OUTPUT_NAME: reportPath,
  };
  const run = spawnSync(
    "node",
    ["scripts/run-production-e2e.mjs", "--reporter=json,line", ...playwrightArgs],
    { env, stdio: "inherit" },
  );
  if (!existsSync(reportPath)) {
    process.exitCode = run.status || 1;
    console.error("No Playwright report was written; the build or server failed first.");
    return;
  }
  const summary = summarizeReport(JSON.parse(readFileSync(reportPath, "utf8")));
  writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);
  for (const [project, counts] of Object.entries(summary)) {
    console.log(
      `${project}: ${counts.passed} passed (${counts.flaky} after a retry), ${counts.failed} failed, ${counts.skipped} skipped`,
    );
  }
  process.exitCode = run.status ?? 1;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)) {
  main();
}
