import { getServiceClient } from "../apps/web/src/lib/supabase-service";
import { registerOrgDomain } from "../apps/web/src/lib/vercel";

/**
 * One-off backfill: registers every existing org's subdomain as its own
 * Vercel domain, so each gets an auto-renewing HTTP-01 cert instead of
 * relying on the (broken, non-auto-renewing) *.dubgrid.com wildcard cert.
 *
 * Run from the repo root (the root tsconfig maps "@/*" at apps/web/src, which
 * is what the helpers this imports use internally):
 *   npx tsx --env-file=.env.remote scripts/backfill-vercel-domains.ts
 */
async function main() {
  const baseDomain = process.env.NEXT_PUBLIC_BASE_DOMAIN;
  if (!baseDomain) {
    console.error("ERROR: NEXT_PUBLIC_BASE_DOMAIN is not set.");
    process.exit(1);
  }
  if (!process.env.VERCEL_API_TOKEN || !process.env.VERCEL_PROJECT_ID) {
    console.error("ERROR: VERCEL_API_TOKEN and VERCEL_PROJECT_ID must be set.");
    process.exit(1);
  }

  const db = getServiceClient();

  // Paginate explicitly: PostgREST's default row cap (1000) would otherwise
  // silently truncate this once org count grows past it.
  const PAGE_SIZE = 1000;
  const orgs: { id: string; name: string; slug: string | null }[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await db
      .from("organizations")
      .select("id, name, slug")
      .range(from, from + PAGE_SIZE - 1);
    if (error) {
      console.error("Failed to fetch organizations:", error);
      process.exit(1);
    }
    orgs.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) break;
  }

  const withSlug = orgs.filter(
    (org): org is { id: string; name: string; slug: string } => !!org.slug,
  );
  console.log(`Found ${withSlug.length} organizations with a subdomain.`);

  let succeeded = 0;
  let failed = 0;
  for (const org of withSlug) {
    const domain = `${org.slug}.${baseDomain}`;
    try {
      await registerOrgDomain(domain);
      console.log(`  ok    ${domain} (${org.name})`);
      succeeded++;
    } catch (err) {
      console.error(`  FAIL  ${domain} (${org.name}):`, err);
      failed++;
    }
  }

  console.log(`\nDone. ${succeeded} succeeded, ${failed} failed.`);
  if (failed > 0) process.exit(1);
}

main();
