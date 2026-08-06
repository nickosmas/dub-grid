/**
 * Supply-chain scan: catches a compromised dependency or a planted persistence
 * file before it reaches main.
 *
 * Offline checks (always run, no network, fail the process):
 *   1. Known-bad versions in package-lock.json. Seeded with the packages
 *      trojanized by the August 2026 npm worm; extend DENYLIST as advisories
 *      land.
 *   2. Worm markers in tracked files — C2 contract address, exfil repo
 *      description, recursion guard, single-instance lock name.
 *   3. Planted persistence files. The worm's GitHub propagation path writes
 *      `.vscode/tasks.json` (runs on folder open) and `.claude/setup.mjs` (runs
 *      on Claude session start) into every repo it can push to. `.claude/` is
 *      gitignored here, so such a file would never appear in `git status` —
 *      this check is the only thing that would see it.
 *
 * Online check (opt-in via --freshness, warns rather than fails):
 *   4. Dependencies whose resolved version was published within the cooldown
 *      window. A malicious version is typically caught and unpublished within
 *      hours to a couple of days, so anything newer than the window deserves a
 *      human look before it ships.
 *
 * The offline path is deliberately dependency-free: it has to keep working when
 * the dependency tree is exactly what is in question.
 *
 * Usage:
 *   npm run deps:scan                    # offline checks
 *   npm run deps:scan -- --freshness     # + registry publish-date check
 *   npm run deps:scan -- --freshness --days=3 --since=HEAD~1
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = new URL("..", import.meta.url).pathname;

/** name -> versions known to ship malicious code. */
export const DENYLIST = {
  keyv: ["6.0.0"],
  cacheable: ["2.5.1"],
  ecto: ["5.0.1"],
  // flat-cache is the dangerous one to miss: it is a transitive dependency of
  // eslint, so it reaches far more trees than the cache packages above.
  "flat-cache": ["6.1.24"],
  "@cacheable/net": ["2.1.1"],
  "@cacheable/node-cache": ["3.1.2"],
  "@cacheable/memoize": ["2.5.1"],
  "@cacheable/utils": ["2.5.1"],
};

export const MARKERS = [
  "thebeautifulmarchoftime",
  "thebeautifulsnadsoftime",
  "Shai-Hulud",
  "0xE1f2395ee43e45A1556EC6438a88c31B83493103",
  "IfYouBlockThisAPIKeyItWillCrashTheLiveProductionServersOfAllThirdPartyClients",
  "_NODE_RUNTIME_INIT",
  "tmp.dpkg_14527.lock",
  // C2 hosts the payload exfiltrates to, all on 443.
  "awqhnjewqjkl.icu",
  "pypi-get.com",
  "js-mirror.com",
  "npm-cache.com",
];

/**
 * Persistence the payload plants outside any repo, so no amount of scanning a
 * checkout would find it. Dormant in the observed sample, but present.
 */
export const HOST_PERSISTENCE = [
  ".local/bin/gh-token-monitor.sh",
  ".config/gh-token-monitor",
  "Library/LaunchAgents/com.user.gh-token-monitor.plist",
  ".config/systemd/user/gh-token-monitor.service",
];

/** Files the worm plants to re-trigger itself when a developer opens the repo. */
export const PLANTED_PATHS = [
  ".vscode/tasks.json",
  ".vscode/setup.mjs",
  ".claude/setup.mjs",
  ".claude/math_init.js",
  "setup.mjs",
  "math_init.js",
  "Math_Symbol.js",
];

/**
 * `.claude/settings.json` is both a legitimate Claude Code file and one the
 * worm writes, so its presence proves nothing — only a hook that launches the
 * loader does. Checking for the file itself would cry wolf on every repo.
 */
export const HOOKED_SETTINGS = ".claude/settings.json";
export const HOOK_LAUNCHERS = ["setup.mjs", "math_init.js", "Math_Symbol.js"];

/** `node_modules/a/node_modules/@scope/b` -> `@scope/b` */
export function packageNameFromLockPath(lockPath) {
  const i = lockPath.lastIndexOf("node_modules/");
  return i === -1 ? null : lockPath.slice(i + "node_modules/".length);
}

/** Every (name, version) pair in a parsed lockfile. */
export function lockfileEntries(lock) {
  const out = [];
  for (const [path, entry] of Object.entries(lock.packages ?? {})) {
    const name = packageNameFromLockPath(path);
    if (name && entry.version) out.push({ name, version: entry.version, path });
  }
  return out;
}

export function findDenylisted(entries, denylist = DENYLIST) {
  return entries.filter(({ name, version }) => denylist[name]?.includes(version));
}

// --- offline checks ---------------------------------------------------------

function checkLockfile(failures) {
  const lockPath = join(ROOT, "package-lock.json");
  if (!existsSync(lockPath)) {
    failures.push(
      "package-lock.json is missing. Dependencies would resolve unpinned — see CONTRIBUTING.md, Changing Dependencies.",
    );
    return [];
  }
  const entries = lockfileEntries(JSON.parse(readFileSync(lockPath, "utf8")));
  for (const { name, version, path } of findDenylisted(entries)) {
    failures.push(`Known-compromised dependency: ${name}@${version} (${path})`);
  }
  return entries;
}

function checkMarkers(failures) {
  // git grep only sees tracked files, which is the point: node_modules is not
  // the artifact under review here, the committed tree is.
  for (const marker of MARKERS) {
    let hits = [];
    try {
      hits = execFileSync("git", ["grep", "-l", "--fixed-strings", marker], {
        cwd: ROOT,
        encoding: "utf8",
      })
        .split("\n")
        .filter(Boolean)
        // This scanner necessarily contains the strings it searches for.
        .filter((f) => f !== "scripts/supply-chain-scan.mjs");
    } catch {
      // git grep exits 1 when there are no matches, which is the good case.
    }
    for (const file of hits) failures.push(`Worm marker "${marker}" found in ${file}`);
  }
}

function checkPlantedFiles(failures) {
  for (const rel of PLANTED_PATHS) {
    if (existsSync(join(ROOT, rel))) {
      failures.push(
        `Unexpected file ${rel} — the npm worm plants this to re-trigger on repo open. ` +
          `If you added it deliberately, remove it from PLANTED_PATHS in this script.`,
      );
    }
  }

  // Presence is normal; a loader reference in it is not.
  const settingsPath = join(ROOT, HOOKED_SETTINGS);
  if (existsSync(settingsPath)) {
    const body = readFileSync(settingsPath, "utf8");
    for (const launcher of HOOK_LAUNCHERS) {
      // A `hooks` block that runs the loader on session start is the giveaway.
      if (/"hooks"\s*:/.test(body) && body.includes(launcher)) {
        failures.push(
          `${HOOKED_SETTINGS} contains a hook referencing ${launcher} — ` +
            `the worm installs a Claude session hook to relaunch its loader.`,
        );
      }
    }
  }
}

/**
 * The repo is not the only thing at risk: the payload writes a launch agent /
 * systemd unit under $HOME that survives any amount of cleaning in a checkout.
 */
function checkHostPersistence(failures) {
  const home = process.env.HOME;
  if (!home) return;
  for (const rel of HOST_PERSISTENCE) {
    if (existsSync(join(home, rel))) {
      failures.push(`Host persistence artifact ~/${rel} — this machine looks compromised.`);
    }
  }
}

// --- opt-in freshness check -------------------------------------------------

/** Versions present now that were absent at `since`, so we only check what moved. */
function newlyIntroduced(entries, since) {
  let before;
  try {
    before = new Set(
      lockfileEntries(
        JSON.parse(
          execFileSync("git", ["show", `${since}:package-lock.json`], {
            cwd: ROOT,
            encoding: "utf8",
            maxBuffer: 1e9,
          }),
        ),
      ).map(({ name, version }) => `${name}@${version}`),
    );
  } catch {
    return null; // no comparable baseline; caller falls back to the full tree
  }
  const seen = new Map();
  for (const { name, version } of entries) {
    const key = `${name}@${version}`;
    if (!before.has(key)) seen.set(key, { name, version });
  }
  return [...seen.values()];
}

async function checkFreshness(entries, { days, since }) {
  const cutoff = Date.now() - days * 86_400_000;
  let targets = since ? newlyIntroduced(entries, since) : null;
  if (!targets) {
    const seen = new Map();
    for (const { name, version } of entries) seen.set(`${name}@${version}`, { name, version });
    targets = [...seen.values()];
  }

  console.log(`Checking publish dates for ${targets.length} package versions…`);
  const fresh = [];
  const CONCURRENCY = 12;
  const queues = Array.from({ length: CONCURRENCY }, (_, i) =>
    targets.filter((_, idx) => idx % CONCURRENCY === i),
  );

  await Promise.all(
    queues.map(async (queue) => {
      for (const { name, version } of queue) {
        try {
          const res = await fetch(`https://registry.npmjs.org/${name.replace("/", "%2f")}`, {
            headers: { accept: "application/json" },
          });
          if (!res.ok) continue; // aliases and private names 404; not our concern
          const published = (await res.json()).time?.[version];
          if (published && Date.parse(published) >= cutoff) {
            fresh.push({ name, version, published });
          }
        } catch {
          // Network flakiness must not fail a security check that is advisory.
        }
      }
    }),
  );

  fresh.sort((a, b) => a.published.localeCompare(b.published));
  return fresh;
}

// --- entry point ------------------------------------------------------------
// Guarded so the helpers above can be imported and tested without the CLI
// running (and calling process.exit) as a side effect of the import.

async function main(argv) {
  const flag = (name, fallback) => {
    const hit = argv.find((a) => a.startsWith(`--${name}=`));
    return hit ? hit.slice(name.length + 3) : fallback;
  };

  const failures = [];
  const entries = checkLockfile(failures);
  checkMarkers(failures);
  checkPlantedFiles(failures);
  checkHostPersistence(failures);

  if (argv.includes("--freshness")) {
    const fresh = await checkFreshness(entries, {
      days: Number(flag("days", "7")),
      since: flag("since", null),
    });
    if (fresh.length > 0) {
      console.warn(`\n⚠ ${fresh.length} package version(s) published inside the cooldown window:`);
      for (const f of fresh) console.warn(`  ${f.published}  ${f.name}@${f.version}`);
      console.warn(
        "\nNot a failure on its own. Confirm each is an expected release before shipping —\n" +
          "a version published hours ago has not had time to be caught and unpublished.\n",
      );
    } else {
      console.log("No package versions published inside the cooldown window.");
    }
  }

  if (failures.length > 0) {
    console.error("Supply-chain scan FAILED:\n");
    for (const f of failures) console.error(`  ✗ ${f}`);
    console.error("");
    return 1;
  }

  console.log("Supply-chain scan passed: no known-bad versions, markers, or planted files.");
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(await main(process.argv.slice(2)));
}
