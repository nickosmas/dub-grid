import "server-only";

import { CURRENT_TERMS_VERSION } from "@/features/account/shared/terms";
import { getServiceClient } from "@/lib/supabase-service";

export { CURRENT_TERMS_VERSION };

/**
 * Check if a user has accepted the current terms version.
 */
export async function hasAcceptedCurrentTerms(userId: string): Promise<boolean> {
  const { data } = await getServiceClient()
    .from("profiles")
    .select("terms_version")
    .eq("id", userId)
    .single();

  return data?.terms_version === CURRENT_TERMS_VERSION;
}

/**
 * Record a user's acceptance of the current terms version.
 */
export async function acceptTerms(userId: string): Promise<void> {
  // Insert immutable acceptance record (ignore duplicate — user may have
  // already accepted this version on a different org/session)
  const { error: insertError } = await getServiceClient()
    .from("terms_acceptances")
    .insert({
      user_id: userId,
      terms_version: CURRENT_TERMS_VERSION,
    });
  if (insertError && !insertError.message?.includes("duplicate")) {
    throw insertError;
  }

  // Update profile with latest acceptance
  const { error: updateError } = await getServiceClient()
    .from("profiles")
    .update({
      terms_accepted_at: new Date().toISOString(),
      terms_version: CURRENT_TERMS_VERSION,
    })
    .eq("id", userId);
  if (updateError) throw updateError;
}
