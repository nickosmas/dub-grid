import type { Client } from "pg";

/**
 * Tables Supabase's supautils locks in ACCESS EXCLUSIVE mode, one at a time,
 * whenever the current role runs CREATE or DROP POLICY (its `policy_grants`
 * list: every auth, storage and realtime table). A migration that touches a
 * policy therefore also locks auth.users, which every foreign key to a user
 * checks, so a parallel suite writing a schedule row can close a cycle.
 */
export async function policyGrantTables(db: Client): Promise<string[]> {
  const { rows } = await db.query<{ grants: string | null; role: string }>(
    `SELECT current_setting('supautils.policy_grants', true) AS grants, current_user AS role`,
  );
  const { grants, role } = rows[0]!;
  if (!grants) return [];
  const listed = (JSON.parse(grants) as Record<string, string[]>)[role] ?? [];
  // The list names tables a given Storage version may not have (storage.prefixes).
  const { rows: existing } = await db.query<{ name: string }>(
    `SELECT name FROM unnest($1::text[]) AS name WHERE to_regclass(name) IS NOT NULL`,
    [listed],
  );
  return existing.map((row) => row.name);
}

// statement_timeout, lock_not_available, deadlock_detected
const RETRYABLE = new Set(["57014", "55P03", "40P01"]);

/**
 * Opens a transaction that already holds every lock the migration under test
 * needs, taken in one statement before anything else. The statement gives up
 * well inside Postgres's one-second deadlock_timeout and is retried, so a
 * parallel suite that queued behind a partly taken set is released before its
 * deadlock check runs, and this suite never holds a lock while waiting on one.
 */
export async function beginWithLocks(db: Client, tables: string[]): Promise<void> {
  const list = tables.map((table) =>
    table
      .split(".")
      .map((part) => `"${part}"`)
      .join("."),
  );
  for (let attempt = 1; ; attempt++) {
    await db.query("BEGIN");
    try {
      await db.query("SET LOCAL statement_timeout = '400ms'");
      await db.query(`LOCK TABLE ${list.join(", ")} IN ACCESS EXCLUSIVE MODE`);
      await db.query("SET LOCAL statement_timeout = 0");
      return;
    } catch (error) {
      await db.query("ROLLBACK");
      if (!RETRYABLE.has((error as { code?: string }).code ?? "") || attempt >= 150) throw error;
      await new Promise((resolve) => setTimeout(resolve, 50 + Math.random() * 150));
    }
  }
}
