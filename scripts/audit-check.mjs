/**
 * `npm audit` with an expiring allowlist.
 *
 * The plain `npm audit --audit-level=high` this replaces has one failure mode
 * that matters: when an advisory has no fixed version anywhere upstream, the
 * gate is red forever and the only ways out are bad ones — pin the level down
 * to `critical` and stop seeing highs at all, drop the job, or take npm's
 * suggested "fix" even when that is a major *downgrade* of a framework. Each of
 * those trades the whole gate away to silence one finding.
 *
 * So findings can be allowlisted individually, and each entry has to say why
 * and carry a date. Two rules keep the list from becoming the place advisories
 * go to be forgotten:
 *
 *   - Past its `reviewBy`, an entry stops suppressing and the build fails. An
 *     exception is a decision with a shelf life, not a permanent waiver.
 *   - An entry that matches nothing also fails. Once upstream ships a fix and
 *     the tree moves, the stale entry has to come out, so the list can never
 *     quietly suppress something it was never weighed against.
 *
 * Anything not on the list fails the build exactly as before.
 *
 * Usage:
 *   node scripts/audit-check.mjs                 # --audit-level=high
 *   node scripts/audit-check.mjs --level=critical
 */
import { execFileSync } from "node:child_process";

/**
 * Advisories that are known, weighed, and deliberately not blocking.
 *
 * `ids` are GHSA identifiers as they appear in the advisory URL. Keep `reason`
 * concrete — the next reader needs to re-make this call, not just read that
 * someone once made it.
 */
const ALLOWLIST = [
  {
    ids: ["GHSA-qxc2-j82w-r537"],
    package: "@faker-js/faker",
    reviewBy: "2026-12-01",
    reason:
      "Arbitrary code execution through `faker.helpers.fake()`, which evaluates the template string " +
      "it is handed. Reachable only by passing attacker-controlled text to that one function, and " +
      "nothing here calls it: faker arrives as a transitive dependency of @snaplet/copycat, which " +
      "@snaplet/seed uses, and both are devDependencies that run only in the seed scripts " +
      "(`npm run seed`, `db:reset`) against templates we write ourselves. There is no fix to take: " +
      "the advisory covers <= 10.4.0, and @snaplet/copycat 6.0.0 is the newest published version " +
      "but pins @faker-js/faker ^8.4.1, so the patched 10.5.0 sits two majors outside the range " +
      "copycat declares. Forcing it through an override would hand the seed tooling a data " +
      "generator API it was never built against. Revisit when copycat publishes on a patched faker.",
  },
  {
    ids: ["GHSA-vcc3-ghjq-m6fr", "GHSA-qr28-fpjm-wq7f"],
    package: "decode-uri-component",
    reviewBy: "2026-12-01",
    reason:
      "Malformed percent-encoded input decodes in exponential or quadratic time. decode-uri-component " +
      "0.2.2 ships in the mobile app under query-string 7, through expo-router and React " +
      "Navigation, where it parses the app's own deep links: the trigger is a crafted link opened " +
      "on the user's own device, and the worst case is a stalled app on that device. The fixes " +
      "are 0.4.2 and 0.5.1, which are ESM-only, while query-string 7 requires it as CommonJS, so " +
      "an override would break link parsing; even the newest expo-router (58) needs an Expo SDK " +
      "upgrade to move query-string. Revisit with the Expo SDK upgrade (F-124).",
  },
  {
    ids: ["GHSA-3g3m-2fjr-6pw4", "GHSA-g3hv-75wg-m249", "GHSA-gcqx-w48m-w2h4"],
    package: "glob, minimatch, deepmerge",
    reviewBy: "2026-12-01",
    reason:
      "A glob AbortSignal cancellation bypass, a minimatch denial of service through brace " +
      "amplification, and deepmerge prototype poisoning of the object it returns. Every copy runs " +
      "at build or configuration time over our own files: Expo's config and prebuild tooling " +
      "under expo-constants, expo-splash-screen and @expo/cli (reading app.json and plugins), the " +
      "@snaplet/seed CLI, and the shadcn CLI. None is in the mobile bundle or the web server, and " +
      "the inputs are patterns and config objects we write. The fixes are majors the callers do " +
      "not accept (glob 14.0.2 and minimatch 11.0.1, both published 2026-10-27), and deepmerge " +
      "has no fixed release. Revisit with the Expo SDK upgrade (F-127).",
  },
  {
    ids: ["GHSA-mrhx-c7xc-m3w5"],
    package: "zod",
    reviewBy: "2026-12-01",
    reason:
      "Validating an oversized collection against a constrained schema can exhaust memory. The web " +
      "routes and @dubgrid/contracts are on zod 4.6.7 (F-189), and the zod 4 copies under " +
      "eslint-plugin-react-hooks and the shadcn MCP server are pinned to it by overrides, so nothing " +
      "that validates production input is affected. What is left is zod 3.25.76 inside build and " +
      "seed tooling that requires zod 3, which has no fixed release: @expo/cli (Expo SDK 57), " +
      "@snaplet/seed (0.98 still requires ^3.23.5) and the shadcn CLI. Each validates its own config " +
      "and our seed templates on a developer machine or in CI, never request input. Revisit with the " +
      "Expo SDK upgrade, a zod 4 @snaplet/seed, and shadcn 4.23 or later (which moves to zod 4).",
  },
];

/** Every GHSA id in `via`, following the chains npm nests inside each other. */
function collectAdvisoryIds(name, vulnerabilities, seen = new Set()) {
  if (seen.has(name)) return [];
  seen.add(name);

  const found = [];
  for (const via of vulnerabilities[name]?.via ?? []) {
    // A string `via` names another vulnerable package; an object is the
    // advisory itself, and only that carries the URL the id lives in.
    if (typeof via === "string") {
      found.push(...collectAdvisoryIds(via, vulnerabilities, seen));
      continue;
    }
    const id = /(?<ghsa>GHSA-[0-9a-z-]+)/i.exec(via.url ?? "")?.groups?.ghsa;
    found.push(id ?? `${via.source ?? "unknown"}:${via.title ?? via.name ?? "unknown"}`);
  }
  return found;
}

function runAudit() {
  let payload;
  try {
    // Exits non-zero whenever it finds anything, so the throw is the normal
    // path and the payload is on the error.
    payload = JSON.parse(execFileSync("npm", ["audit", "--json"], { encoding: "utf8" }));
  } catch (error) {
    if (!error.stdout) throw error;
    payload = JSON.parse(error.stdout);
  }

  // A registry 503 exits non-zero and prints JSON too, but an error body rather
  // than a report. It parses cleanly and carries no vulnerabilities, so without
  // this check it reads as a spotless tree: every allowlist entry matches
  // nothing and the gate tells you to delete advisories it never looked at. A
  // report always carries `metadata`, so its absence is the reliable signal.
  if (!payload.metadata) {
    const reason = payload.error?.summary ?? payload.error?.code ?? "no report in the response";
    throw new Error(reason);
  }
  return payload;
}

const SEVERITY_ORDER = ["info", "low", "moderate", "high", "critical"];

function main(argv) {
  const level = argv.find((arg) => arg.startsWith("--level="))?.slice("--level=".length) ?? "high";
  const threshold = SEVERITY_ORDER.indexOf(level);
  if (threshold < 0) {
    console.error(`Unknown --level=${level}. Expected one of: ${SEVERITY_ORDER.join(", ")}`);
    return 1;
  }

  const today = new Date().toISOString().slice(0, 10);
  const allowedIds = new Map();
  for (const entry of ALLOWLIST) {
    for (const id of entry.ids) allowedIds.set(id, entry);
  }

  let report;
  try {
    report = runAudit();
  } catch (error) {
    console.error(`\n✗ npm audit did not return a report: ${error.message}`);
    console.error(
      "  The gate could not read the tree, so it cannot clear it. Re-run, and if the\n" +
        "  registry keeps failing, leave this red rather than acting on an empty result.",
    );
    return 1;
  }

  const { vulnerabilities = {} } = report;
  const blocking = [];
  const suppressed = [];
  const matchedEntries = new Set();

  for (const [name, vulnerability] of Object.entries(vulnerabilities)) {
    if (SEVERITY_ORDER.indexOf(vulnerability.severity) < threshold) continue;

    const ids = [...new Set(collectAdvisoryIds(name, vulnerabilities))];
    // Allowlisted only when EVERY advisory behind it is. A package that also
    // carries an unreviewed advisory still blocks, which is the whole point of
    // resolving the chain rather than matching on package names.
    const entries = ids.map((id) => allowedIds.get(id));
    const expired = entries.filter((entry) => entry && entry.reviewBy < today);

    if (ids.length > 0 && entries.every(Boolean) && expired.length === 0) {
      for (const entry of entries) matchedEntries.add(entry);
      suppressed.push({ name, severity: vulnerability.severity, ids });
      continue;
    }

    for (const entry of expired) matchedEntries.add(entry);
    blocking.push({
      name,
      severity: vulnerability.severity,
      ids,
      expired: expired.length > 0 ? expired : null,
    });
  }

  for (const item of suppressed) {
    const entry = allowedIds.get(item.ids[0]);
    console.log(`  allowlisted  ${item.name} (${item.severity}) — review by ${entry.reviewBy}`);
  }

  const stale = ALLOWLIST.filter((entry) => !matchedEntries.has(entry));
  for (const entry of stale) {
    console.error(
      `\n✗ Allowlist entry for ${entry.package} (${entry.ids.join(", ")}) matches nothing.` +
        `\n  The advisory is gone from the tree — delete the entry from scripts/audit-check.mjs.`,
    );
  }

  for (const item of blocking) {
    if (item.expired) {
      console.error(
        `\n✗ ${item.name} (${item.severity}) — allowlist entry expired on ${item.expired[0].reviewBy}.` +
          `\n  Re-check whether a fix exists now. If it still doesn't, extend reviewBy deliberately.`,
      );
    } else {
      console.error(
        `\n✗ ${item.name} (${item.severity}) — ${item.ids.join(", ") || "no advisory id"}`,
      );
    }
  }

  if (blocking.length === 0 && stale.length === 0) {
    console.log(
      `\nnpm audit: no unreviewed vulnerabilities at ${level} or above` +
        (suppressed.length ? ` (${suppressed.length} allowlisted)` : ""),
    );
    return 0;
  }

  console.error(
    `\nAudit FAILED: ${blocking.length} unreviewed at ${level}+, ${stale.length} stale allowlist entr${stale.length === 1 ? "y" : "ies"}.\n` +
      `Run \`npm audit\` for the full report.\n`,
  );
  return 1;
}

process.exit(main(process.argv.slice(2)));
