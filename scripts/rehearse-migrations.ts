import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { createConnection } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import {
  assertLegacyPatchManifest,
  assertMigrationChecksumManifest,
  loadMigrationInventory,
  migrationDirectory,
  type MigrationFile,
} from "./lib/migration-readiness";
import {
  assertLoopbackUrl,
  buildScratchConfig,
  parseDryRunVersions,
  renderEvidence,
  splitAtBoundary,
  type RehearsalMode,
  type RehearsalRecord,
} from "./lib/migration-rehearsal";

// The rehearsal reads only the database, so every other service stays down.
const EXCLUDED_SERVICES = [
  "gotrue",
  "realtime",
  "storage-api",
  "imgproxy",
  "kong",
  "mailpit",
  "postgrest",
  "postgres-meta",
  "studio",
  "edge-runtime",
  "logflare",
  "vector",
  "supavisor",
];
// The sign-in smoke needs auth, the REST and realtime APIs, storage and the gateway.
const SEEDED_EXCLUDED_SERVICES = [
  "imgproxy",
  "mailpit",
  "postgres-meta",
  "studio",
  "edge-runtime",
  "logflare",
  "vector",
  "supavisor",
];
// Variables that could point a child process at a real project.
const STRIPPED_ENV = [
  "DATABASE_URL",
  "SUPABASE_DB_PASSWORD",
  "SUPABASE_ACCESS_TOKEN",
  "SUPABASE_DB_TRANSPORT",
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "PRODUCTION_PROJECT_REFS",
];

interface Options {
  from: string;
  seeded: boolean;
  stop: boolean;
  smoke: string | null;
  portBase: number;
  evidence: string | null;
  productionBoundary: string | null;
  boundarySource: string | null;
}

interface Scratch {
  workdir: string;
  apiUrl: string;
  dbUrl: string;
}

function readOptions(argv: string[]): Options {
  const value = (flag: string): string | null => {
    const index = argv.indexOf(flag);
    if (index < 0) return null;
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) throw new Error(`${flag} needs a value.`);
    return next;
  };
  if (argv.includes("--stop")) {
    return {
      from: "",
      seeded: false,
      stop: true,
      smoke: value("--smoke"),
      portBase: 0,
      evidence: null,
      productionBoundary: null,
      boundarySource: null,
    };
  }
  const from = value("--from");
  if (!from || !/^\d{1,3}$/.test(from)) {
    throw new Error("--from <NNN|0> is required: the ledger version the scratch stack starts at.");
  }
  const portBase = Number(value("--port-base") ?? "55320");
  if (!Number.isInteger(portBase) || portBase < 1024 || portBase > 65000) {
    throw new Error("--port-base must be a port number between 1024 and 65000.");
  }
  const options: Options = {
    from: /^0+$/.test(from) ? "0" : from.padStart(3, "0"),
    seeded: argv.includes("--seeded"),
    stop: false,
    smoke: null,
    portBase,
    evidence: value("--evidence"),
    productionBoundary: value("--production-boundary"),
    boundarySource: value("--boundary-source"),
  };
  if (options.seeded && options.from === "0") {
    throw new Error("--seeded needs an upgrade boundary, not a clean install.");
  }
  if (options.evidence && (!options.productionBoundary || !options.boundarySource)) {
    throw new Error("--evidence needs --production-boundary and --boundary-source.");
  }
  return options;
}

function childEnv(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const env = { ...process.env };
  for (const key of STRIPPED_ENV) delete env[key];
  return { ...env, ...extra };
}

function run(
  command: string,
  args: string[],
  options: { cwd: string; env?: NodeJS.ProcessEnv; allowFailure?: boolean },
): string {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    env: options.env ?? childEnv(),
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  process.stdout.write(output);
  if (result.status !== 0 && !options.allowFailure) {
    throw new Error(`${command} ${args.join(" ")} exited with ${result.status ?? result.signal}.`);
  }
  return output;
}

function portInUse(port: number): Promise<boolean> {
  return new Promise((resolvePort) => {
    const socket = createConnection({ host: "127.0.0.1", port });
    socket.once("connect", () => {
      socket.destroy();
      resolvePort(true);
    });
    socket.once("error", () => resolvePort(false));
    socket.setTimeout(1000, () => {
      socket.destroy();
      resolvePort(false);
    });
  });
}

async function assertPortsFree(ports: Record<string, number>): Promise<void> {
  const busy: string[] = [];
  for (const [name, port] of Object.entries(ports)) {
    if (await portInUse(port)) busy.push(`${name} ${port}`);
  }
  if (busy.length > 0) {
    throw new Error(`Scratch ports are in use (${busy.join(", ")}); choose another --port-base.`);
  }
}

function copyMigrations(files: MigrationFile[], source: string, target: string): void {
  for (const file of files) copyFileSync(join(source, file.file), join(target, file.file));
}

function prepareScratch(repoRoot: string, options: Options, install: MigrationFile[]) {
  const projectId = `dg-rehearsal-${Date.now().toString(36)}`;
  const scratch = buildScratchConfig(readFileSync(join(repoRoot, "supabase/config.toml"), "utf8"), {
    projectId,
    portBase: options.portBase,
  });
  const workdir = mkdtempSync(join(tmpdir(), "dg-rehearsal-"));
  const supabaseDir = join(workdir, "supabase");
  mkdirSync(join(supabaseDir, "migrations"), { recursive: true });
  writeFileSync(join(supabaseDir, "config.toml"), scratch.toml);
  cpSync(join(repoRoot, "supabase/templates"), join(supabaseDir, "templates"), { recursive: true });
  copyMigrations(install, migrationDirectory(repoRoot), join(supabaseDir, "migrations"));
  return {
    projectId,
    ports: scratch.ports,
    scratch: {
      workdir,
      apiUrl: assertLoopbackUrl(`http://127.0.0.1:${scratch.ports["api.port"]}`),
      dbUrl: assertLoopbackUrl(
        `postgresql://postgres:postgres@127.0.0.1:${scratch.ports["db.port"]}/postgres`,
      ),
    } satisfies Scratch,
  };
}

function inspect(repoRoot: string, scratch: Scratch, expectComplete: boolean): string[] {
  const args = ["tsx", join(repoRoot, "scripts/inspect-migration-readiness.ts"), "--local"];
  if (expectComplete) args.push("--expect-complete");
  const output = run("npx", args, {
    cwd: repoRoot,
    env: childEnv({ NEXT_PUBLIC_SUPABASE_URL: scratch.apiUrl, DATABASE_URL: scratch.dbUrl }),
  });
  if (output.includes("Migration readiness inspection failed")) {
    throw new Error("The inspector reported a failure.");
  }
  const lines = output
    .split("\n")
    .filter((line) =>
      /^(PASS|FAIL|DEFER) |^Remote ledger:|^Missing forward migrations:/.test(line),
    );
  // A deferred check prints FAIL and then DEFER; the DEFER is its verdict.
  const deferred = new Set(
    lines.filter((line) => line.startsWith("DEFER ")).map((line) => line.split(" ")[1]),
  );
  return lines.filter((line) => !(line.startsWith("FAIL ") && deferred.has(line.split(" ")[1])));
}

function dryRun(scratch: Scratch): ReturnType<typeof parseDryRunVersions> {
  const output = run(
    "npx",
    ["supabase", "db", "push", "--local", "--workdir", scratch.workdir, "--dry-run"],
    {
      cwd: scratch.workdir,
    },
  );
  return parseDryRunVersions(output);
}

function stop(scratch: Scratch): void {
  run("npx", ["supabase", "stop", "--workdir", scratch.workdir, "--no-backup"], {
    cwd: scratch.workdir,
    allowFailure: true,
  });
  rmSync(scratch.workdir, { recursive: true, force: true });
}

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function gitCommit(repoRoot: string): string {
  const head = run("git", ["rev-parse", "HEAD"], { cwd: repoRoot }).trim();
  const dirty = run("git", ["status", "--porcelain", "--", "scripts", "supabase"], {
    cwd: repoRoot,
  }).trim();
  return dirty ? `${head} (with uncommitted changes under scripts/ or supabase/)` : head;
}

function sameVersions(actual: string[], expected: string[]): boolean {
  return actual.length === expected.length && actual.every((version, i) => version === expected[i]);
}

interface SeededState {
  projectId: string;
  workdir: string;
  apiUrl: string;
  dbUrl: string;
  evidence: string | null;
  record: Omit<RehearsalRecord, "smokeResult" | "finishedAt">;
}

function seededStatePath(): string {
  return join(tmpdir(), "dg-rehearsal-seeded.json");
}

/** The commit just before `nextVersion` was added: the seed that matched the boundary. */
function boundaryCommit(repoRoot: string, nextVersion: string): string {
  const added = run(
    "git",
    ["log", "--diff-filter=A", "--format=%H", "--", `supabase/migrations/${nextVersion}_*.sql`],
    { cwd: repoRoot },
  )
    .trim()
    .split("\n")
    .filter(Boolean)
    .at(-1);
  if (!added) throw new Error(`No commit adds migration ${nextVersion}.`);
  return run("git", ["rev-parse", `${added}^`], { cwd: repoRoot }).trim();
}

function seedAtBoundary(repoRoot: string, scratch: Scratch, commit: string): void {
  const tree = mkdtempSync(join(tmpdir(), "dg-rehearsal-seed-"));
  run("git", ["worktree", "add", "--detach", tree, commit], { cwd: repoRoot });
  try {
    symlinkSync(realpathSync(join(repoRoot, "node_modules")), join(tree, "node_modules"));
    run("npx", ["tsx", "seed.ts"], {
      cwd: tree,
      env: childEnv({
        DATABASE_URL: assertLoopbackUrl(scratch.dbUrl),
        NEXT_PUBLIC_SUPABASE_URL: assertLoopbackUrl(scratch.apiUrl),
      }),
    });
  } finally {
    run("git", ["worktree", "remove", "--force", tree], { cwd: repoRoot, allowFailure: true });
    rmSync(tree, { recursive: true, force: true });
  }
}

function writeEvidence(repoRoot: string, target: string, record: RehearsalRecord): void {
  const path = resolve(repoRoot, target);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, renderEvidence(record));
  console.log(`Evidence written to ${target}`);
}

function stopSeeded(repoRoot: string, smoke: string | null): void {
  if (!existsSync(seededStatePath())) throw new Error("No seeded rehearsal is running.");
  const state = JSON.parse(readFileSync(seededStatePath(), "utf8")) as SeededState;
  try {
    if (state.evidence && smoke) {
      writeEvidence(repoRoot, state.evidence, {
        ...state.record,
        smokeResult: smoke,
        finishedAt: new Date().toISOString(),
      });
    } else if (state.evidence) {
      console.log("Evidence not written: pass --smoke with the sign-in result.");
    }
  } finally {
    stop(state);
    rmSync(seededStatePath(), { force: true });
  }
}

async function main(): Promise<void> {
  const options = readOptions(process.argv.slice(2));
  const repoRoot = resolve(import.meta.dirname, "..");
  if (options.stop) {
    stopSeeded(repoRoot, options.smoke);
    return;
  }
  if (options.seeded && existsSync(seededStatePath())) {
    throw new Error("A seeded rehearsal is already running; end it with --stop first.");
  }
  const startedAt = new Date().toISOString();

  const inventory = loadMigrationInventory(migrationDirectory(repoRoot));
  assertMigrationChecksumManifest(
    inventory,
    resolve(repoRoot, "supabase/migrations/checksums.sha256"),
  );
  assertLegacyPatchManifest(
    resolve(repoRoot, "supabase/patches"),
    resolve(repoRoot, "supabase/patches/README.md"),
  );
  const split = splitAtBoundary(
    inventory.map((migration) => migration.version),
    options.from,
  );
  const install = inventory.filter((migration) => split.install.includes(migration.version));
  const suffix = inventory.filter((migration) => split.suffix.includes(migration.version));
  const mode: RehearsalMode =
    options.from === "0" ? "clean" : options.seeded ? "seeded upgrade" : "upgrade";
  const commit = gitCommit(repoRoot);

  const { projectId, ports, scratch } = prepareScratch(repoRoot, options, install);
  console.log(
    `Rehearsal ${projectId}: ${mode}, starting at ${options.from}, applying ${split.suffix.join(", ")}`,
  );
  let keepRunning = false;
  try {
    await assertPortsFree(ports);
    const excluded = options.seeded ? SEEDED_EXCLUDED_SERVICES : EXCLUDED_SERVICES;
    run("npx", ["supabase", "start", "--workdir", scratch.workdir, "-x", excluded.join(",")], {
      cwd: scratch.workdir,
    });
    if (options.seeded) {
      const seedCommit = boundaryCommit(repoRoot, split.suffix[0]);
      console.log(`Seeding the ${options.from} database with seed.ts from ${seedCommit}`);
      seedAtBoundary(repoRoot, scratch, seedCommit);
    }

    const inspectorBefore =
      mode === "clean"
        ? ["not applicable: the database starts empty"]
        : inspect(repoRoot, scratch, false);
    const startingLedger =
      mode === "clean"
        ? "empty (0 entries)"
        : `${split.install[0]}-${options.from} (${install.length} entries)` +
          (options.seeded ? ", seeded at the boundary" : "");

    copyMigrations(
      suffix,
      migrationDirectory(repoRoot),
      join(scratch.workdir, "supabase/migrations"),
    );
    const preview = dryRun(scratch);
    if (preview.upToDate || !sameVersions(preview.versions, split.suffix)) {
      throw new Error(
        `The dry run proposed ${preview.versions.join(", ") || "nothing"}, not ${split.suffix.join(", ")}.`,
      );
    }

    run("npx", ["supabase", "db", "push", "--local", "--workdir", scratch.workdir, "--yes"], {
      cwd: scratch.workdir,
    });
    const inspectorAfter = inspect(repoRoot, scratch, true);
    const final = dryRun(scratch);
    if (!final.upToDate) throw new Error("The final dry run still proposes migrations.");
    console.log(`Rehearsal passed: ${split.suffix.length} migration(s) applied and qualified.`);

    const record = {
      mode,
      commit,
      checksumsSha256: sha256(resolve(repoRoot, "supabase/migrations/checksums.sha256")),
      assumedProductionBoundary: options.productionBoundary ?? "",
      boundarySource: options.boundarySource ?? "",
      startingLedger,
      dryRunVersions: preview.versions,
      applyResult: `applied ${split.suffix.length} migration(s) without error`,
      inspectorBefore,
      inspectorAfter,
      finalDryRun: "Local database is up to date.",
      startedAt,
    };
    if (options.seeded) {
      const state: SeededState = { projectId, ...scratch, evidence: options.evidence, record };
      writeFileSync(seededStatePath(), JSON.stringify(state, null, 2));
      keepRunning = true;
      console.log(
        [
          "",
          "The seeded stack is running for the sign-in smoke. Point a dev server at:",
          `  NEXT_PUBLIC_SUPABASE_URL=${scratch.apiUrl}`,
          `  keys: npx supabase status --workdir ${scratch.workdir} -o env`,
          'End it with: npm run db:migrations:rehearse -- --stop --smoke "<result>"',
        ].join("\n"),
      );
    } else if (options.evidence) {
      writeEvidence(repoRoot, options.evidence, {
        ...record,
        finishedAt: new Date().toISOString(),
      });
    }
  } finally {
    if (!keepRunning) stop(scratch);
  }
}

main().catch((error: unknown) => {
  console.error(
    `Migration rehearsal failed: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
});
