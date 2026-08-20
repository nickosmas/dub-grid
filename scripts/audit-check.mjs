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
      "files on a developer machine or in CI — it is not in the shipped app and not in the web " +
      "server, so a denial of service there stops a build we control rather than anything a user " +
      "or attacker can reach. There is no fix to take: the advisory covers <= 2.0.2 and 2.0.2 is " +
      "the newest published version, first_patched_version null. npm's proposed fix is expo@53, " +
      "a major downgrade off SDK 54. Revisit when image-size publishes a patched release or Expo " +
      "moves Metro onto one.",
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
  try {
    // Exits non-zero whenever it finds anything, so the throw is the normal
    // path and the payload is on the error.
    return JSON.parse(execFileSync("npm", ["audit", "--json"], { encoding: "utf8" }));
  } catch (error) {
    if (error.stdout) return JSON.parse(error.stdout);
    throw error;
  }
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

  const { vulnerabilities = {} } = runAudit();
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
