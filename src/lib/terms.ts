/**
 * Terms of Service version tracking.
 * Bump CURRENT_TERMS_VERSION whenever terms change to require re-acceptance.
 */

export const CURRENT_TERMS_VERSION = "1.0.0";

import { supabase } from "@/lib/supabase";

/**
 * Check if a user has accepted the current terms version.
 */
export async function hasAcceptedCurrentTerms(userId: string): Promise<boolean> {
  const { data } = await supabase
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
  // Insert immutable acceptance record
  const { error: insertError } = await supabase
    .from("terms_acceptances")
    .insert({
      user_id: userId,
      terms_version: CURRENT_TERMS_VERSION,
    });
  if (insertError) throw insertError;

  // Update profile with latest acceptance
  const { error: updateError } = await supabase
    .from("profiles")
    .update({
      terms_accepted_at: new Date().toISOString(),
      terms_version: CURRENT_TERMS_VERSION,
    })
    .eq("id", userId);
  if (updateError) throw updateError;
}
