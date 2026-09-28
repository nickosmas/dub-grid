import type { SupabaseClient } from "@supabase/supabase-js";
import { endUserSessions } from "@/lib/auth/revocation";

/** A reset that failed after it had already removed `factorsRemoved` factors. */
export class PartialTwoFactorResetError extends Error {
  constructor(
    readonly factorsRemoved: number,
    readonly cause: unknown,
  ) {
    super("Two-factor reset stopped part way");
    this.name = "PartialTwoFactorResetError";
  }
}

/**
 * Resets someone's two-factor for a Gridmaster. Each step is safe to repeat.
 * The flag goes in before any factor is removed, so a reset that fails part
 * way still makes the next sign-in enroll again and a retry finishes the rest;
 * it goes in after the factors are listed, so a failed list changes nothing.
 */
export async function resetPersonTwoFactor(
  client: SupabaseClient,
  userId: string,
): Promise<{ factorsRemoved: number }> {
  const { data, error } = await client.auth.admin.mfa.listFactors({ userId });
  if (error) throw error;
  const factors = data?.factors ?? [];

  const { error: flagError } = await client
    .from("profiles")
    .update({ mfa_reenroll_required_at: new Date().toISOString() })
    .eq("id", userId);
  if (flagError) throw flagError;
  let factorsRemoved = 0;
  try {
    for (const factor of factors) {
      const { error: deleteError } = await client.auth.admin.mfa.deleteFactor({
        id: factor.id,
        userId,
      });
      if (deleteError) throw deleteError;
      factorsRemoved += 1;
    }

    const { error: offError } = await client
      .from("profiles")
      .update({ mfa_enabled: false })
      .eq("id", userId);
    if (offError) throw offError;

    await endUserSessions(userId);
  } catch (error) {
    // Once a factor is gone the person must hear of it and the reset must be
    // on record, even though the rest still needs a retry (F-90).
    if (factorsRemoved > 0) throw new PartialTwoFactorResetError(factorsRemoved, error);
    throw error;
  }
  return { factorsRemoved };
}
