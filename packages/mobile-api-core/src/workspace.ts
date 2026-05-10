import type { SupabaseClient } from "@supabase/supabase-js";

export type MobileWorkspaceLookup = {
  id: string;
  name: string;
  slug: string;
  suspendedAt: string | null;
  subscriptionStatus: string | null;
  trialEndsAt: string | null;
};

export function normalizeMobileWorkspaceSlug(
  slug: string | null | undefined,
): string {
  return slug?.trim().toLowerCase() ?? "";
}

export function isValidMobileWorkspaceSlug(
  slug: string,
  reservedSlugs: ReadonlySet<string>,
): boolean {
  return (
    !!slug &&
    !reservedSlugs.has(slug) &&
    /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(slug)
  );
}

export async function findMobileWorkspaceBySlug(
  serviceClient: SupabaseClient,
  slug: string,
): Promise<MobileWorkspaceLookup | null> {
  const { data, error } = await serviceClient
    .from("organizations")
    .select("id, name, slug, suspended_at, subscription_status, trial_ends_at")
    .eq("slug", slug)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data || typeof data.slug !== "string") {
    return null;
  }

  return {
    id: data.id as string,
    name: data.name as string,
    slug: data.slug,
    suspendedAt: (data.suspended_at as string | null | undefined) ?? null,
    subscriptionStatus:
      (data.subscription_status as string | null | undefined) ?? null,
    trialEndsAt: (data.trial_ends_at as string | null | undefined) ?? null,
  };
}
