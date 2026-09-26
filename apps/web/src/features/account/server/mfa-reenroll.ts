import { resolveVerifiedTotpFactorPresence } from "@dubgrid/authz";
import { getServiceClient } from "@/lib/supabase-service";
import { updateSelfMfaStatus } from "./profile";

/**
 * Whether a Gridmaster's two-factor reset still requires this person to enroll
 * again. A verified factor found here settles it, so enrolling any way at all
 * lifts the gate on web and mobile alike.
 */
export async function resolveMfaReenrollRequired(userId: string): Promise<boolean> {
  const client = getServiceClient();
  const { data: profile, error } = await client
    .from("profiles")
    .select("mfa_reenroll_required_at")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!profile?.mfa_reenroll_required_at) return false;

  const { data, error: authError } = await client.auth.admin.getUserById(userId);
  if (authError) throw authError;
  if (resolveVerifiedTotpFactorPresence(data?.user?.factors) === true) {
    await updateSelfMfaStatus(userId, true);
    return false;
  }
  return true;
}
