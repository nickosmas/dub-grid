import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { connectSqlClient } from "../../../../scripts/lib/db-client";
import {
  assertLegacyPatchManifest,
  assertMigrationChecksumManifest,
  assertSafeForwardLedger,
  compareMigrationLedger,
  loadMigrationInventory,
  migrationDirectory,
  projectRefFromUrl,
  protectedProductionRefs,
  type MigrationFile,
} from "../../../../scripts/lib/migration-readiness";
import { QUALIFICATION_SQL } from "../../../../scripts/inspect-migration-readiness";

function migration(version: string, name: string): MigrationFile {
  return { version, name, file: `${version}_${name}.sql`, sha256: "a".repeat(64) };
}

// `db:migrations:check` ran only by hand, so an edited, already-locked
// migration passed CI (41d2). The real files are checked on every test run.
describe("the committed migrations", () => {
  const repoRoot = resolve(process.cwd(), "..", "..");
  const manifest = resolve(repoRoot, "supabase/migrations/checksums.sha256");

  it("match their locked checksums", () => {
    const inventory = loadMigrationInventory(migrationDirectory(repoRoot));

    expect(inventory.length).toBeGreaterThan(40);
    expect(() => assertMigrationChecksumManifest(inventory, manifest)).not.toThrow();
  });

  it("fail the check when a locked migration's bytes change", () => {
    const copy = mkdtempSync(join(tmpdir(), "dg-migrations-"));
    try {
      cpSync(migrationDirectory(repoRoot), copy, { recursive: true });
      const [first] = loadMigrationInventory(copy);
      const path = join(copy, first!.file);
      writeFileSync(path, `${readFileSync(path, "utf8")}\n-- edited\n`);

      expect(() => assertMigrationChecksumManifest(loadMigrationInventory(copy), manifest)).toThrow(
        /changed after checksum lock/,
      );
    } finally {
      rmSync(copy, { recursive: true, force: true });
    }
  });
});

/** A scratch directory that is removed after each test. */
const tempDirs: string[] = [];
function tempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

describe("production migration readiness", () => {
  afterEach(() => {
    for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  const originalTransport = process.env.SUPABASE_DB_TRANSPORT;
  const originalToken = process.env.SUPABASE_ACCESS_TOKEN;

  afterEach(() => {
    if (originalTransport === undefined) delete process.env.SUPABASE_DB_TRANSPORT;
    else process.env.SUPABASE_DB_TRANSPORT = originalTransport;
    if (originalToken === undefined) delete process.env.SUPABASE_ACCESS_TOKEN;
    else process.env.SUPABASE_ACCESS_TOKEN = originalToken;
    vi.unstubAllGlobals();
  });

  it("recognizes only hosted Supabase project URLs and protects production by default", () => {
    expect(projectRefFromUrl("https://xpoylacxkbphnudsupuu.supabase.co")).toBe(
      "xpoylacxkbphnudsupuu",
    );
    expect(protectedProductionRefs().has("xpoylacxkbphnudsupuu")).toBe(true);
    expect(() => projectRefFromUrl("https://example.com")).toThrow(/hosted Supabase/);
  });

  it("loads only a contiguous, canonical migration sequence", () => {
    const root = tempDir("dubgrid-migrations-");
    writeFileSync(join(root, "001_schema.sql"), "SELECT 1;");
    writeFileSync(join(root, "002_functions.sql"), "SELECT 2;");
    expect(loadMigrationInventory(root).map((entry) => entry.version)).toEqual(["001", "002"]);

    writeFileSync(join(root, "004_gap.sql"), "SELECT 4;");
    expect(() => loadMigrationInventory(root)).toThrow(/expected 003, found 004/);
  });

  it("rejects ledger gaps, renamed entries, and unknown remote migrations", () => {
    const local = [
      migration("001", "schema"),
      migration("002", "functions"),
      migration("003", "rls"),
    ];
    const safe = compareMigrationLedger(local, [
      { version: "001", name: "schema" },
      { version: "002", name: "functions" },
    ]);
    expect(safe.isForwardSuffix).toBe(true);
    expect(safe.missingRemote.map((entry) => entry.version)).toEqual(["003"]);
    expect(() => assertSafeForwardLedger(safe)).not.toThrow();

    const gap = compareMigrationLedger(local, [
      { version: "001", name: "schema" },
      { version: "003", name: "rls" },
    ]);
    expect(() => assertSafeForwardLedger(gap)).toThrow(/gap/);

    const renamed = compareMigrationLedger(local, [{ version: "001", name: "different" }]);
    expect(() => assertSafeForwardLedger(renamed)).toThrow(/disagree/);

    const unknown = compareMigrationLedger(local, [{ version: "999", name: "surprise" }]);
    expect(() => assertSafeForwardLedger(unknown)).toThrow(/unknown versions/);
  });

  it("requires a disposition for every historical patch", () => {
    const root = tempDir("dubgrid-patches-");
    const patches = join(root, "patches");
    mkdirSync(patches);
    writeFileSync(join(patches, "legacy.sql"), "SELECT 1;");
    const manifest = join(patches, "README.md");
    writeFileSync(manifest, "`legacy.sql` is historical evidence.");
    expect(assertLegacyPatchManifest(patches, manifest)).toEqual(["legacy.sql"]);
    writeFileSync(manifest, "No mapping.");
    expect(() => assertLegacyPatchManifest(patches, manifest)).toThrow(/legacy.sql/);
  });

  it("fails when a locked migration is edited or the checksum manifest drifts", () => {
    const root = tempDir("dubgrid-checksums-");
    const entry = migration("001", "schema");
    const manifest = join(root, "checksums.sha256");
    writeFileSync(manifest, `${entry.sha256}  ${entry.file}\n`);
    expect(() => assertMigrationChecksumManifest([entry], manifest)).not.toThrow();

    expect(() =>
      assertMigrationChecksumManifest([{ ...entry, sha256: "f".repeat(64) }], manifest),
    ).toThrow(/changed after checksum lock/);
    writeFileSync(manifest, `${entry.sha256}  999_unknown.sql\n`);
    expect(() => assertMigrationChecksumManifest([entry], manifest)).toThrow(/unknown migrations/);
  });

  it("keeps remote qualification SQL read-only and aggregate-only", () => {
    expect(QUALIFICATION_SQL).not.toMatch(
      /\b(insert|update|delete|drop|alter|create|truncate|grant|revoke|notify|call)\b/i,
    );
    expect(QUALIFICATION_SQL).not.toMatch(/\b(email|phone|first_name|last_name)\b/i);
    expect(QUALIFICATION_SQL).toContain("count(*)");
  });

  it("bounds Management API inspection requests", async () => {
    process.env.SUPABASE_DB_TRANSPORT = "https";
    process.env.SUPABASE_ACCESS_TOKEN = "test-token";
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) => new Response("[]", { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const client = await connectSqlClient({
      connectionString: "postgresql://unused",
      projectRef: "test-project",
    });
    await client.query("SELECT count(*) FROM public.example");

    expect(fetchMock).toHaveBeenCalledOnce();
    const request = fetchMock.mock.calls[0]?.[1];
    expect(request?.method).toBe("POST");
    expect(request?.signal).toBeInstanceOf(AbortSignal);
  });
});
