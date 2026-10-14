export interface ScratchConfig {
  toml: string;
  /** New port per `section.key`, for example `api.port` or `db.port`. */
  ports: Record<string, number>;
}

export interface BoundarySplit {
  install: string[];
  suffix: string[];
}

export interface DryRunResult {
  upToDate: boolean;
  versions: string[];
}

export type RehearsalMode = "clean" | "upgrade" | "seeded upgrade";

export interface RehearsalRecord {
  mode: RehearsalMode;
  commit: string;
  checksumsSha256: string;
  assumedProductionBoundary: string;
  boundarySource: string;
  startingLedger: string;
  dryRunVersions: string[];
  applyResult: string;
  inspectorBefore: string[];
  inspectorAfter: string[];
  finalDryRun: string;
  smokeResult?: string;
  reviewer?: string;
  startedAt: string;
  finishedAt: string;
}

const SHARED_PORT_RANGE = { min: 54320, max: 54329 };
const DISABLED_SERVICES = new Set(["studio", "inbucket", "analytics"]);
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]", "::1"]);
const NOT_EXERCISED = "not exercised (local-only qualification)";

/**
 * Rewrites the shared stack's config.toml for a scratch stack that can run
 * beside it: a new project id, every port moved off the shared range,
 * services the rehearsal never reads switched off, and no seeding.
 */
export function buildScratchConfig(
  configToml: string,
  options: { projectId: string; portBase: number },
): ScratchConfig {
  const ports: Record<string, number> = {};
  let section = "";
  let outsideRangeOffset = 10;

  const lines = configToml.split("\n").map((line) => {
    const header = /^\[([^\]]+)\]\s*$/.exec(line);
    if (header) {
      section = header[1];
      return line;
    }
    if (section === "" && /^project_id\s*=/.test(line)) {
      return `project_id = "${options.projectId}"`;
    }
    const port = /^(\w*port)\s*=\s*(\d+)\s*$/.exec(line);
    if (port) {
      const current = Number(port[2]);
      const inSharedRange = current >= SHARED_PORT_RANGE.min && current <= SHARED_PORT_RANGE.max;
      const next = inSharedRange
        ? options.portBase + (current - SHARED_PORT_RANGE.min)
        : options.portBase + outsideRangeOffset++;
      ports[`${section}.${port[1]}`] = next;
      return `${port[1]} = ${next}`;
    }
    if (/^enabled\s*=/.test(line) && (DISABLED_SERVICES.has(section) || section === "db.seed")) {
      return "enabled = false";
    }
    if (section === "db.seed" && /^sql_paths\s*=/.test(line)) {
      if (!/^sql_paths\s*=\s*\[[^\]]*\]\s*$/.test(line)) {
        throw new Error(
          "Cannot rewrite a multi-line [db.seed] sql_paths; the scratch stack must not seed.",
        );
      }
      return "sql_paths = []";
    }
    return line;
  });

  assertScratchPorts(ports);
  return { toml: lines.join("\n"), ports };
}

function assertScratchPorts(ports: Record<string, number>): void {
  const values = Object.values(ports);
  if (!ports["api.port"] || !ports["db.port"]) {
    throw new Error("Scratch config is missing the api or db port.");
  }
  if (new Set(values).size !== values.length) {
    throw new Error("Scratch config assigns the same port twice.");
  }
  const shared = values.filter(
    (value) => value >= SHARED_PORT_RANGE.min && value <= SHARED_PORT_RANGE.max,
  );
  if (shared.length > 0) {
    throw new Error(`Scratch ports overlap the shared stack: ${shared.join(", ")}.`);
  }
}

/**
 * Splits the ordered migration versions at `from`: the versions the scratch
 * stack starts with, and the suffix the rehearsal applies. `0` is a clean
 * install that starts empty.
 */
export function splitAtBoundary(versions: string[], from: string): BoundarySplit {
  if (/^0+$/.test(from)) return { install: [], suffix: [...versions] };
  const index = versions.indexOf(from);
  if (index === -1) {
    throw new Error(`Boundary ${from} is not a checked-in migration version.`);
  }
  const suffix = versions.slice(index + 1);
  if (suffix.length === 0) {
    throw new Error(`Boundary ${from} is the latest migration; there is nothing to rehearse.`);
  }
  return { install: versions.slice(0, index + 1), suffix };
}

/** Refuses any database or API URL that is not on this machine. */
export function assertLoopbackUrl(value: string): string {
  let host: string;
  try {
    host = new URL(value).hostname;
  } catch {
    throw new Error("Rehearsal URL is not a valid URL.");
  }
  if (!LOOPBACK_HOSTS.has(host)) {
    throw new Error(`Rehearsal refuses a non-local host: ${host}.`);
  }
  return value;
}

/** Reads `supabase db push --dry-run` output. */
export function parseDryRunVersions(output: string): DryRunResult {
  const text = output.replace(/\u001b\[[0-9;]*m/g, "");
  if (/(Local|Remote) database is up to date\./.test(text)) {
    return { upToDate: true, versions: [] };
  }
  const header = text.indexOf("Would push these migrations:");
  if (header === -1) {
    throw new Error("Unrecognized db push --dry-run output.");
  }
  const versions = [...text.slice(header).matchAll(/\b(\d{3})_[a-z0-9_]+\.sql\b/g)].map(
    (match) => match[1],
  );
  if (versions.length === 0) {
    throw new Error("db push --dry-run listed no migrations.");
  }
  return { upToDate: false, versions };
}

/** Fills the runbook's evidence template for a local-only rehearsal. */
export function renderEvidence(record: RehearsalRecord): string {
  const fields: Array<[string, string]> = [
    ["Rehearsal mode", record.mode],
    ["Commit", record.commit],
    ["Migration checksums reviewed", `checksums.sha256 sha256 ${record.checksumsSha256}`],
    ["Assumed production boundary", record.assumedProductionBoundary],
    ["Boundary source", record.boundarySource],
    ["Production ref confirmed", NOT_EXERCISED],
    ["Production daily backup timestamp", NOT_EXERCISED],
    ["Production ledger before", NOT_EXERCISED],
    ["Rehearsal stack starting ledger", record.startingLedger],
    ["Rehearsal dry run", record.dryRunVersions.join(", ")],
    ["Rehearsal dry run reviewed by", record.reviewer ?? "pending owner review"],
    ["Rehearsal apply result", record.applyResult],
    ["Rehearsal final dry run", record.finalDryRun],
    ["Rehearsal smoke result", record.smokeResult ?? "not required for this mode"],
    ["Production apply authorization", NOT_EXERCISED],
    ["Production apply result", NOT_EXERCISED],
    ["Production inspector, health, smoke, and final dry run", NOT_EXERCISED],
    ["Started", record.startedAt],
    ["Finished", record.finishedAt],
  ];
  const body = [
    `# Migration rehearsal: ${record.mode}`,
    "",
    "> Point-in-time evidence from a local scratch stack. No remote project was",
    "> read or written. Read the live production ledger before any release.",
    "",
    ...fields.map(([label, value]) => `- **${label}:** ${value}`),
    "",
    "## Inspector before the apply",
    "",
    "```text",
    ...record.inspectorBefore,
    "```",
    "",
    "## Inspector after the apply",
    "",
    "```text",
    ...record.inspectorAfter,
    "```",
    "",
  ].join("\n");
  assertNoSecrets(body);
  return body;
}

function assertNoSecrets(text: string): void {
  if (/postgres(ql)?:\/\/[^\s:@]+:[^\s@]+@/.test(text)) {
    throw new Error("Evidence must not contain a connection string with a password.");
  }
  if (/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/.test(text)) {
    throw new Error("Evidence must not contain a key or token.");
  }
}
