import type { SupabaseClient, User } from "@supabase/supabase-js";

const MAX_SLUG_ATTEMPTS = 5;

function randomSandboxSlug(): string {
  const random = Math.random().toString(36).slice(2, 10);
  const stamp = Date.now().toString(36).slice(-6);
  return `sandbox-${stamp}${random}`;
}

/**
 * Returns the active sandbox org owned by this user, if any. We only ever
 * keep one sandbox alive per user — entering twice just re-attaches to the
 * existing one.
 */
export async function findActiveSandboxForUser(
  serviceClient: SupabaseClient,
  userId: string,
): Promise<{ id: string; slug: string | null } | null> {
  const { data, error } = await serviceClient
    .from("organizations")
    .select("id, slug")
    .eq("workspace_kind", "sandbox")
    .eq("sandbox_owner_user_id", userId)
    .is("archived_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as { id: string; slug: string | null } | null) ?? null;
}

/**
 * Create a fresh sandbox workspace owned by `actor` and seeded with the
 * minimum config required for the user to be able to navigate the app
 * inside it. Returns the new sandbox's id.
 */
export async function createSandboxForUser(input: {
  serviceClient: SupabaseClient;
  actor: User;
  sourceOrgId: string;
}): Promise<{ id: string; slug: string }> {
  const { serviceClient, actor, sourceOrgId } = input;

  // Pull a few display fields from the source so the sandbox feels related
  // to the org the user is testing on.
  const { data: sourceOrg, error: sourceErr } = await serviceClient
    .from("organizations")
    .select(
      "name, focus_area_label, certification_label, role_label, department_label, shift_display_mode, timezone, pay_period_start_date",
    )
    .eq("id", sourceOrgId)
    .maybeSingle();
  if (sourceErr) throw sourceErr;

  let createdOrgId: string | null = null;
  let createdSlug: string | null = null;
  let lastError: unknown = null;
  for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt += 1) {
    const slug = randomSandboxSlug();
    const { data: orgRow, error: insertErr } = await serviceClient
      .from("organizations")
      .insert({
        name: sourceOrg?.name
          ? `${sourceOrg.name} — Sandbox`
          : "Sandbox workspace",
        slug,
        workspace_kind: "sandbox",
        sandbox_owner_user_id: actor.id,
        sandbox_source_org_id: sourceOrgId,
        focus_area_label: sourceOrg?.focus_area_label ?? null,
        certification_label: sourceOrg?.certification_label ?? null,
        role_label: sourceOrg?.role_label ?? null,
        department_label: sourceOrg?.department_label ?? null,
        shift_display_mode: sourceOrg?.shift_display_mode ?? "code",
        timezone: sourceOrg?.timezone ?? "UTC",
        pay_period_start_date: sourceOrg?.pay_period_start_date ?? null,
        // Sandboxes are exempt from billing gates.
        subscription_status: "active",
        trial_ends_at: null,
      })
      .select("id, slug")
      .maybeSingle();
    if (!insertErr && orgRow) {
      createdOrgId = orgRow.id as string;
      createdSlug = (orgRow.slug as string | null) ?? slug;
      break;
    }
    lastError = insertErr;
    // Slug collision (unique constraint) — retry with a new random slug.
    if (insertErr?.code !== "23505") {
      throw insertErr;
    }
  }
  if (!createdOrgId || !createdSlug) {
    throw lastError ?? new Error("Could not allocate a sandbox workspace.");
  }

  // Add the actor as a super_admin member of their sandbox so RLS allows
  // them to interact with it just like any real workspace they belong to.
  const { error: membershipErr } = await serviceClient
    .from("organization_memberships")
    .insert({
      user_id: actor.id,
      org_id: createdOrgId,
      org_role: "super_admin",
      onboarding_completed_at: new Date().toISOString(),
    });
  if (membershipErr) {
    // Best-effort cleanup if membership fails.
    await serviceClient.from("organizations").delete().eq("id", createdOrgId);
    throw membershipErr;
  }

  return { id: createdOrgId, slug: createdSlug };
}

/**
 * Verify ownership and hard-delete the sandbox org. FK cascades take care of
 * memberships, focus areas, departments, schedule rows, etc.
 */
export async function deleteSandboxForUser(input: {
  serviceClient: SupabaseClient;
  actor: User;
  sandboxOrgId: string;
}): Promise<void> {
  const { data, error } = await input.serviceClient
    .from("organizations")
    .select("id")
    .eq("id", input.sandboxOrgId)
    .eq("workspace_kind", "sandbox")
    .eq("sandbox_owner_user_id", input.actor.id)
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    throw new Error("Sandbox not found or not owned by the caller.");
  }

  const { error: deleteError } = await input.serviceClient
    .from("organizations")
    .delete()
    .eq("id", input.sandboxOrgId);
  if (deleteError) throw deleteError;
}
