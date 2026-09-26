import type { SupabaseClient } from "@supabase/supabase-js";
import { endUserSessions } from "@/lib/auth/revocation";

/**
 * Resets someone's two-factor for a Gridmaster. Each step is safe to repeat,
 * and the flag goes first, so a reset that fails part way still makes the
 * next sign-in enroll again and a retry finishes the rest.
 */
export async function resetPersonTwoFactor(
  client: SupabaseClient,
  userId: string,
): Promise<{ factorsRemoved: number }> {
  const flaggedAt = new Date().toISOString();
  const { error: flagError } = await client
    .from("profiles")
    .update({ mfa_reenroll_required_at: flaggedAt })
    .eq("id", userId);
  if (flagError) throw flagError;

  const { data, error } = await client.auth.admin.mfa.listFactors({ userId });
  if (error) throw error;
  const factors = data?.factors ?? [];
  for (const factor of factors) {
    const { error: deleteError } = await client.auth.admin.mfa.deleteFactor({
      id: factor.id,
      userId,
    });
    if (deleteError) throw deleteError;
  }

  const { error: offError } = await client
    .from("profiles")
    .update({ mfa_enabled: false })
    .eq("id", userId);
  if (offError) throw offError;

  await endUserSessions(userId);
  return { factorsRemoved: factors.length };
}
