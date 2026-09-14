import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { connectSqlClient, type SqlClient } from "./lib/db-client";
import {
  assertSafeForwardLedger,
  compareMigrationLedger,
  loadMigrationInventory,
  migrationDirectory,
  projectRefFromUrl,
  protectedProductionRefs,
  type LedgerEntry,
} from "./lib/migration-readiness";

interface QualificationRow {
  check_name: string;
  passed: boolean;
  detail: string;
}

const CHECK_INTRODUCED_BY: Readonly<Record<string, string>> = {
  caller_org_id_validates_live_state: "016",
  scheduler_calloff_function: "019",
  scheduler_calloff_trigger: "019",
};

export const QUALIFICATION_SQL = `
WITH org_tables_without_rls AS (
  SELECT count(*)::int AS count
  FROM pg_class relation
  JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
  WHERE namespace.nspname = 'public'
    AND relation.relkind = 'r'
    AND EXISTS (
      SELECT 1
      FROM information_schema.columns column_info
      WHERE column_info.table_schema = 'public'
        AND column_info.table_name = relation.relname
        AND column_info.column_name = 'org_id'
    )
    AND NOT relation.relrowsecurity
), checks AS (
  SELECT 'org_scoped_tables_have_rls' AS check_name,
         count = 0 AS passed,
         count::text AS detail
  FROM org_tables_without_rls
  UNION ALL
  SELECT 'legacy_department_array_columns', count(*) = 2, count(*)::text
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name IN ('organization_roles', 'certifications')
    AND column_name = 'department_ids'
  UNION ALL
  SELECT 'legacy_department_indexes', count(*) = 4, count(*)::text
  FROM pg_indexes
  WHERE schemaname = 'public'
    AND indexname IN (
      'organization_roles_org_name_active_unique',
      'idx_organization_roles_department_ids',
      'certifications_org_name_active_unique',
      'idx_certifications_department_ids'
    )
  UNION ALL
  SELECT 'role_certification_columns', count(*) = 2, count(*)::text
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND (
      (table_name = 'organization_roles' AND column_name = 'required_certification_ids')
      OR (table_name = 'organizations' AND column_name = 'use_compact_role_certification_labels')
    )
  UNION ALL
  SELECT 'membership_archive_trigger', count(*) = 1, count(*)::text
  FROM pg_trigger
  WHERE tgname = 'trg_membership_archived' AND NOT tgisinternal
  UNION ALL
  SELECT 'caller_org_id_validates_live_state',
         COALESCE(
           pg_get_functiondef(to_regprocedure('public.caller_org_id()')) LIKE '%organization_memberships%'
           AND pg_get_functiondef(to_regprocedure('public.caller_org_id()')) LIKE '%user_sessions%'
           AND pg_get_functiondef(to_regprocedure('public.caller_org_id()')) NOT LIKE '%COALESCE%',
           false
         ),
         CASE WHEN to_regprocedure('public.caller_org_id()') IS NULL THEN 'missing' ELSE 'present' END
  UNION ALL
  SELECT 'auth_hook_not_publicly_executable',
         NOT has_function_privilege('authenticated', 'public.custom_access_token_hook(jsonb)', 'EXECUTE'),
         'privilege check'
  UNION ALL
  SELECT 'auth_hook_executable_by_auth_admin',
         has_function_privilege('supabase_auth_admin', 'public.custom_access_token_hook(jsonb)', 'EXECUTE'),
         'privilege check'
  UNION ALL
  SELECT 'scheduler_calloff_function',
         to_regprocedure('public.finalize_scheduler_staffed_calloffs()') IS NOT NULL,
         CASE WHEN to_regprocedure('public.finalize_scheduler_staffed_calloffs()') IS NULL
              THEN 'missing' ELSE 'present' END
  UNION ALL
  SELECT 'scheduler_calloff_trigger', count(*) = 1, count(*)::text
  FROM pg_trigger
  WHERE tgname = 'trigger_finalize_scheduler_staffed_calloffs' AND NOT tgisinternal
)
SELECT check_name, passed, detail FROM checks ORDER BY check_name
`;

function resolveConnectionString(projectRef: string): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  if (!process.env.SUPABASE_DB_PASSWORD) {
    throw new Error("DATABASE_URL or SUPABASE_DB_PASSWORD is required for read-only inspection.");
  }
  return `postgresql://postgres.${projectRef}:${encodeURIComponent(
    process.env.SUPABASE_DB_PASSWORD,
  )}@aws-0-us-west-2.pooler.supabase.com:6543/postgres`;
}

async function inspectHealth(): Promise<void> {
  const argumentIndex = process.argv.indexOf("--health-url");
  if (argumentIndex < 0) return;
  const url = process.argv[argumentIndex + 1];
  if (!url) throw new Error("--health-url requires an https URL.");
  const parsed = new URL(url);
  if (parsed.protocol !== "https:") throw new Error("Health inspection requires https.");
  const response = await fetch(parsed, { signal: AbortSignal.timeout(15_000) });
  console.log(`Application health: HTTP ${response.status} (${response.ok ? "PASS" : "FAIL"})`);
  if (!response.ok) throw new Error("Application health endpoint did not return a success status.");
}

async function inspectDatabase(db: SqlClient, repoRoot: string): Promise<void> {
  const local = loadMigrationInventory(migrationDirectory(repoRoot));
  const { rows: remote } = await db.query<LedgerEntry>(
    "SELECT version::text, name::text FROM supabase_migrations.schema_migrations ORDER BY version",
  );
  const comparison = compareMigrationLedger(local, remote);
  const appliedVersions = new Set(remote.map((entry) => entry.version));
  const expectComplete = process.argv.includes("--expect-complete");

  console.log(`Remote ledger: ${remote.length} entries`);
  console.log(
    `Missing forward migrations: ${
      comparison.missingRemote.length > 0
        ? comparison.missingRemote.map((migration) => migration.version).join(", ")
        : "none"
    }`,
  );
  assertSafeForwardLedger(comparison);

  const { rows: checks } = await db.query<QualificationRow>(QUALIFICATION_SQL);
  for (const check of checks) {
    console.log(`${check.passed ? "PASS" : "FAIL"} ${check.check_name} (${check.detail})`);
  }
  const failures = checks.filter((check) => {
    if (check.passed) return false;
    const introducedBy = CHECK_INTRODUCED_BY[check.check_name];
    if (introducedBy && !appliedVersions.has(introducedBy)) {
      console.log(`DEFER ${check.check_name} (pending migration ${introducedBy})`);
      return false;
    }
    return true;
  });
  if (failures.length > 0) {
    throw new Error(
      `Remote qualification failed: ${failures.map((check) => check.check_name).join(", ")}.`,
    );
  }
  if (expectComplete && comparison.missingRemote.length > 0) {
    throw new Error(
      `Expected a complete ledger, but ${comparison.missingRemote.length} migration(s) remain pending.`,
    );
  }
}

async function main(): Promise<void> {
  const repoRoot = resolve(import.meta.dirname, "..");
  const localMode = process.argv.includes("--local");
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) throw new Error("NEXT_PUBLIC_SUPABASE_URL is required.");
  const projectRef = localMode ? null : projectRefFromUrl(supabaseUrl);
  const classification = localMode
    ? "local development"
    : protectedProductionRefs(process.env.PRODUCTION_PROJECT_REFS).has(projectRef ?? "")
      ? "protected production"
      : "non-production";
  console.log(`Inspecting ${projectRef ?? "local"} (${classification}) using read-only SQL`);

  const db = await connectSqlClient({
    connectionString: localMode
      ? (process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres")
      : resolveConnectionString(projectRef ?? ""),
    projectRef,
  });
  try {
    await inspectDatabase(db, repoRoot);
  } finally {
    await db.end();
  }
  await inspectHealth();
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Unknown inspection failure";
    console.error(`Migration readiness inspection failed: ${message}`);
    process.exitCode = 1;
  });
}
