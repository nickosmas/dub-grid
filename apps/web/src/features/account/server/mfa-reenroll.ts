import { getServiceClient } from "@/lib/supabase-service";

interface FactorLike {
  factor_type?: string;
  status?: string;
  created_at?: string;
}

function newestVerifiedTotp(factors: unknown): string | null {
  if (!Array.isArray(factors)) return null;
  let newest: string | null = null;
  for (const factor of factors as FactorLike[]) {
    if (factor.factor_type !== "totp" || factor.status !== "verified" || !factor.created_at) {
      continue;
    }
    if (!newest || factor.created_at > newest) newest = factor.created_at;
  }
  return newest;
}

/**
 * Clears a two-factor reset's re-enrollment, but only for a factor verified
 * after the reset. A factor from before it (still counted while the reset is
 * part way) can never lift it. True when this call cleared it.
 */
export async function settleMfaReenrollment(userId: string, factors: unknown): Promise<boolean> {
  const newest = newestVerifiedTotp(factors);
  if (!newest) return false;
  const { data, error } = await getServiceClient()
    .from("profiles")
    .update({ mfa_reenroll_required_at: null })
    .eq("id", userId)
    .lt("mfa_reenroll_required_at", newest)
    .select("id");
  if (error) throw error;
  return (data ?? []).length > 0;
}

/**
 * Whether a Gridmaster's two-factor reset still requires this person to enroll
 * again. A factor verified since the reset settles it, so enrolling any way at
 * all lifts the gate on web and mobile alike.
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
  return !(await settleMfaReenrollment(userId, data?.user?.factors));
}
