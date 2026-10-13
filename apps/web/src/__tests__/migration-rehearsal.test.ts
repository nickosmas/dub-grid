import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  assertLoopbackUrl,
  buildScratchConfig,
  parseDryRunVersions,
  renderEvidence,
  splitAtBoundary,
  type RehearsalRecord,
} from "../../../../scripts/lib/migration-rehearsal";

const repoRoot = resolve(process.cwd(), "..", "..");
const sharedConfig = readFileSync(resolve(repoRoot, "supabase/config.toml"), "utf8");

describe("buildScratchConfig", () => {
  const scratch = buildScratchConfig(sharedConfig, {
    projectId: "dg-rehearsal",
    portBase: 55320,
  });

  it("moves every port off the shared range without collisions", () => {
    const ports = Object.values(scratch.ports);
    expect(ports.length).toBeGreaterThanOrEqual(8);
    expect(new Set(ports).size).toBe(ports.length);
    expect(ports.every((port) => port < 54320 || port > 54329)).toBe(true);
    expect(scratch.toml).not.toMatch(/^\w*port\s*=\s*5432\d\s*$/m);
    expect(scratch.ports["api.port"]).toBe(55321);
    expect(scratch.ports["db.port"]).toBe(55322);
  });

  it("moves ports outside the shared range too", () => {
    expect(scratch.ports["edge_runtime.inspector_port"]).toBe(55330);
    expect(scratch.toml).not.toMatch(/^inspector_port\s*=\s*8083\s*$/m);
  });

  it("renames the project and switches off unused services and seeding", () => {
    expect(scratch.toml).toMatch(/^project_id = "dg-rehearsal"$/m);
    for (const section of ["studio", "inbucket", "analytics", "db.seed"]) {
      const block = scratch.toml.split(`[${section}]`)[1].split("\n[")[0];
      expect(block).toMatch(/^enabled = false$/m);
    }
    expect(scratch.toml).toMatch(/^sql_paths = \[\]$/m);
  });

  it("empties a single-line seed list and rejects one it cannot rewrite", () => {
    const seeded =
      '[api]\nport = 54321\n[db]\nport = 54322\n[db.seed]\nsql_paths = ["./seed.sql"]\n';
    expect(buildScratchConfig(seeded, { projectId: "x", portBase: 55320 }).toml).toMatch(
      /^sql_paths = \[\]$/m,
    );
    const multiLine =
      '[api]\nport = 54321\n[db]\nport = 54322\n[db.seed]\nsql_paths = [\n  "./seed.sql",\n]\n';
    expect(() => buildScratchConfig(multiLine, { projectId: "x", portBase: 55320 })).toThrow(
      /must not seed/,
    );
  });

  it("refuses a port base that lands back in the shared range", () => {
    expect(() => buildScratchConfig(sharedConfig, { projectId: "x", portBase: 54310 })).toThrow(
      /overlap the shared stack/,
    );
  });
});

describe("splitAtBoundary", () => {
  const versions = ["001", "002", "075", "076", "079"];

  it("starts a clean install empty", () => {
    expect(splitAtBoundary(versions, "0")).toEqual({ install: [], suffix: versions });
    expect(splitAtBoundary(versions, "000")).toEqual({ install: [], suffix: versions });
  });

  it("splits an upgrade after the boundary", () => {
    expect(splitAtBoundary(versions, "075")).toEqual({
      install: ["001", "002", "075"],
      suffix: ["076", "079"],
    });
  });

  it("refuses the latest version and an unknown one", () => {
    expect(() => splitAtBoundary(versions, "079")).toThrow(/nothing to rehearse/);
    expect(() => splitAtBoundary(versions, "080")).toThrow(/not a checked-in/);
  });
});

describe("assertLoopbackUrl", () => {
  it("accepts local addresses", () => {
    expect(
      assertLoopbackUrl("postgresql://postgres:postgres@127.0.0.1:55322/postgres"),
    ).toBeTruthy();
    expect(assertLoopbackUrl("http://localhost:55321")).toBeTruthy();
    expect(assertLoopbackUrl("http://[::1]:55321")).toBeTruthy();
  });

  it("refuses a hosted project and its pooler", () => {
    expect(() => assertLoopbackUrl("https://abcdefgh.supabase.co")).toThrow(/non-local host/);
    expect(() =>
      assertLoopbackUrl(
        "postgresql://postgres.ref:pw@aws-0-us-west-1.pooler.supabase.com:6543/postgres",
      ),
    ).toThrow(/non-local host/);
    expect(() => assertLoopbackUrl("not a url")).toThrow(/not a valid URL/);
  });
});

describe("parseDryRunVersions", () => {
  it("reads the migrations a dry run would push", () => {
    const output = [
      "DRY RUN: migrations will *not* be pushed to the database.",
      "Connecting to local database...",
      "Would push these migrations:",
      " \u001b[1m•\u001b[0m 076_billing_policy.sql",
      " • 077_billing_pause.sql",
      " • 078_payment_grace.sql",
      " • 079_billing_history.sql",
    ].join("\n");
    expect(parseDryRunVersions(output)).toEqual({
      upToDate: false,
      versions: ["076", "077", "078", "079"],
    });
  });

  it("recognizes an up-to-date database", () => {
    const output =
      "DRY RUN: migrations will *not* be pushed to the database.\nLocal database is up to date.\n";
    expect(parseDryRunVersions(output)).toEqual({ upToDate: true, versions: [] });
  });

  it("refuses output it does not understand", () => {
    expect(() => parseDryRunVersions("error: connection refused")).toThrow(/Unrecognized/);
  });
});

describe("renderEvidence", () => {
  const record: RehearsalRecord = {
    mode: "upgrade",
    commit: "0123456789abcdef0123456789abcdef01234567",
    checksumsSha256: "f".repeat(64),
    assumedProductionBoundary: "075",
    boundarySource: "recorded 2026-09-28, not a live read",
    startingLedger: "001-075 (75 entries)",
    dryRunVersions: ["076", "077", "078", "079"],
    applyResult: "applied 4 migrations without error",
    inspectorBefore: ["DEFER billing_tables_have_rls (pending migration 076)"],
    inspectorAfter: ["PASS billing_tables_have_rls (3)"],
    finalDryRun: "Local database is up to date.",
    startedAt: "2026-10-13T10:00:00Z",
    finishedAt: "2026-10-13T10:03:00Z",
  };

  it("fills every template field and marks production unexercised", () => {
    const text = renderEvidence(record);
    expect(text).toContain("- **Rehearsal mode:** upgrade");
    expect(text).toContain("- **Assumed production boundary:** 075");
    expect(text).toContain("- **Rehearsal dry run:** 076, 077, 078, 079");
    expect(text).toContain("- **Rehearsal dry run reviewed by:** pending owner review");
    expect(text).toContain(
      "- **Production apply result:** not exercised (local-only qualification)",
    );
    expect(text).toContain("PASS billing_tables_have_rls (3)");
    expect(text).not.toContain("undefined");
  });

  it("refuses evidence that carries a password or a key", () => {
    expect(() =>
      renderEvidence({
        ...record,
        applyResult: "postgresql://postgres:secret@127.0.0.1:55322/postgres",
      }),
    ).toThrow(/password/);
    expect(() =>
      renderEvidence({ ...record, smokeResult: "eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYW5vbiJ9.sig" }),
    ).toThrow(/key or token/);
  });
});
