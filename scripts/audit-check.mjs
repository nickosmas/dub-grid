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
    ids: ["GHSA-w3rx-r6r6-pgpr", "GHSA-5p2g-fcmc-qvqq"],
    package: "image-size",
    reviewBy: "2026-11-01",
    reason:
      "Infinite loops in the ICNS/JXL/HEIF parsers, reachable only by parsing a malicious image. " +
      "image-size is a build-time dependency of Metro, which bundles the mobile app's own asset " +
      "files on a developer machine or in CI; it is not in the shipped app and not in the web " +
      "server, so a denial of service there stops a build we control rather than anything a user " +
      "or attacker can reach. The fix, 2.0.3, is a major version that Metro cannot take: image-size " +
      "2 measures only a buffer, and Metro 0.83.3 passes it a file path, so an override would break " +
      "every image asset. Expo SDK 54's @expo/metro 54.2.0 pins metro 0.83.3 exactly (metro 0.83.8 " +
      "drops image-size, but SDK 54 does not take it). Revisit with the Expo SDK upgrade (F-123).",
  },
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
    ids: ["GHSA-vfj7-8cjw-p6xm"],
    package: "braces",
    reviewBy: "2026-12-01",
    reason:
      "Stack exhaustion when expanding a deeply nested brace pattern. braces turns glob patterns " +
      "into regexes for micromatch, and every copy here sits in build or developer tooling: Metro " +
      "and Jest's transforms under expo and react-native (bundling the mobile app on a developer " +
      "machine or in CI), eslint-config-next, the shadcn CLI, and chokidar under @snaplet/seed. " +
      "The patterns come from our own config files, so the trigger is a hostile pattern in a change " +
      "we review, and the worst case is a crashed build. Nothing ships it: it is not in the mobile " +
      "bundle or the web server. No fix exists to take: 3.0.3 is the newest release and the " +
      "advisory covers <= 3.0.3. Revisit when braces publishes a fix or the Expo SDK upgrade moves " +
      "Metro and Jest off it (F-127).",
  },
  {
    ids: ["GHSA-86w9-cpqp-85rv"],
    package: "node-forge",
    reviewBy: "2026-12-01",
    reason:
      "RSA PKCS#1 v1.5 signature verification accepts extra nested data. The only copy is under " +
      "@expo/cli, which uses it through @expo/code-signing-certificates to sign and verify " +
      "expo-updates manifests. The mobile app does not configure code signing (no " +
      "codeSigningCertificate in apps/mobile/app.json), so no signature is ever verified with it, " +
      "and the CLI runs on developer machines and CI, not in the app. No fix exists: 1.4.0 is the " +
      "newest release and the advisory covers <= 1.4.0. Revisit with the Expo SDK upgrade (F-127).",
  },
  {
    ids: ["GHSA-hp3w-g68c-fv3c"],
    package: "sprintf-js",
    reviewBy: "2026-12-01",
    reason:
      "Denial of service through an unbounded precision specifier in a format string. The one copy " +
      "is sprintf-js 1.0.3 under argparse 1, under js-yaml 3, under babel-plugin-istanbul inside " +
      "react-native's babel-jest: coverage instrumentation that reads our own nyc config at build " +
      "or test time. argparse 1 declares sprintf-js ~1.0.2, and the fixed 1.1.4 is outside that " +
      "range, so an override would hand argparse an API it was not built against. Moderate on its " +
      "own; it is listed because it shares react-native's chain with braces. Revisit with the Expo " +
      "SDK upgrade (F-127).",
  },
  {
    ids: ["GHSA-82fw-gwwq-j7x9", "GHSA-5gmw-xhrv-c9v3", "GHSA-85c8-ppgw-ccpr"],
    package: "vitest",
    reviewBy: "2026-11-15",
    reason:
      "Path traversal in @vitest/mocker's redirect mock, and prototype-pollution gadgets that reach " +
      "code execution through tinypool's worker options. Vitest and its tinypool run only on " +
      "developer machines and in CI over this repository's own test files, so each needs a crafted " +
      "test, mock path or polluted prototype in a change we review. The fixes are Vitest 4.1.11 " +
      "(the mocker) and tinypool 2.1.2, which Vitest 3 cannot take, so all three wait on the Vitest " +
      "major upgrade across web, mobile and the packages (F-125). The short review date reflects " +
      "the critical rating: schedule that upgrade rather than re-dating this entry.",
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
