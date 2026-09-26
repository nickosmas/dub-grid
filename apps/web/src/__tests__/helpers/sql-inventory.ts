import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

export function supabaseMigrationsDir(): string {
  const fromRoot = resolve(process.cwd(), "supabase/migrations");
  return existsSync(fromRoot) ? fromRoot : resolve(process.cwd(), "../../supabase/migrations");
}

export function migrationPath(filename: string): string {
  return resolve(supabaseMigrationsDir(), filename);
}

/**
 * The SECURITY DEFINER functions `authenticated` may call: 016's literal
 * inventory, plus every name a later migration grants. 016 is checksum
 * locked, so a new entry point is recorded by its own migration's GRANT
 * rather than by editing the array.
 */
export function authenticatedSecurityDefinerAllowlist(): string[] {
  const dir = supabaseMigrationsDir();
  const hardening = readFileSync(resolve(dir, "016_harden_authorization_boundaries.sql"), "utf8");
  const block = hardening.match(
    /authenticated_entry_points CONSTANT TEXT\[\] := ARRAY\[([\s\S]*?)\n\s*\];/,
  )?.[1];
  if (!block) throw new Error("Missing authenticated SQL entry-point inventory");
  const names = new Set([...block.matchAll(/'([a-z0-9_]+)'/g)].map((match) => match[1]));

  // In migration order, so a later revoke from authenticated (050) removes a
  // name an earlier grant or the 016 inventory added.
  for (const file of readdirSync(dir).sort()) {
    const ordinal = Number(file.slice(0, 3));
    if (!file.endsWith(".sql") || !Number.isFinite(ordinal) || ordinal <= 16) continue;
    const sql = readFileSync(resolve(dir, file), "utf8");
    for (const match of sql.matchAll(
      // Argument lists may nest one level (NUMERIC(10,2)); role lists may
      // name several roles ("TO authenticated, service_role").
      /(GRANT) EXECUTE ON FUNCTION public\.([a-z0-9_]+)\((?:[^()]|\([^()]*\))*\)\s+TO ([^;]*);|(REVOKE) (?:EXECUTE|ALL) ON FUNCTION public\.([a-z0-9_]+)\((?:[^()]|\([^()]*\))*\)\s+FROM ([^;]*);/g,
    )) {
      if (match[1] && /\bauthenticated\b/.test(match[3])) names.add(match[2]);
      else if (match[4] && /\bauthenticated\b/.test(match[6])) names.delete(match[5]);
    }
  }
  return [...names].sort();
}

/**
 * The newest migration that defines `public.<name>`, which is the definition a
 * freshly migrated database actually holds. Tests that read a fixed migration
 * file pin history; this pins live behaviour, so a later redefinition that
 * drops something load-bearing fails rather than passing unnoticed.
 */
export function latestFunctionDefinition(name: string): { file: string; text: string } {
  const dir = supabaseMigrationsDir();
  const header = `CREATE OR REPLACE FUNCTION public.${name}(`;
  let latest: { file: string; text: string } | null = null;

  for (const file of readdirSync(dir).sort()) {
    if (!file.endsWith(".sql")) continue;
    const sql = readFileSync(resolve(dir, file), "utf8");
    const start = sql.indexOf(header);
    if (start < 0) continue;
    const end = sql.indexOf("\n$$;", start);
    if (end < 0) throw new Error(`Unterminated definition of ${name} in ${file}`);
    latest = { file, text: sql.slice(start, end + "\n$$;".length) };
  }

  if (!latest) throw new Error(`No migration defines public.${name}`);
  return latest;
}
