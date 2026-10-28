import type { SupabaseClient } from "@supabase/supabase-js";
import logger from "@/lib/logger";

/** What decides whether a person can still sign in, read as the JWT hook reads it. */
export interface ContactFacts {
  /** Null when the account has no profile. */
  account: { platformRole: string | null; disabled: boolean } | null;
  /** An unarchived membership in the organization the alert is about. */
  membership: boolean;
  /** Their employee row in that organization, when they have one. */
  employee: { status: string | null; suspended: boolean } | null;
}

export interface ContactChannels {
  inApp: boolean;
  push: boolean;
  email: boolean;
}

const ALL: ContactChannels = { inApp: true, push: true, email: true };
const NONE: ContactChannels = { inApp: false, push: false, email: false };

/**
 * Push and email reach only someone who can still sign in to the organization
 * an alert is about (item 51j). A Suspended person's alerts still collect in
 * the app for when they're reinstated; nothing at all is written for someone
 * who can't come back without a Restore or a Gridmaster. `facts` is null when
 * they couldn't be read: the alert is kept and nothing goes out.
 */
export function contactChannels(
  facts: ContactFacts | null,
  scope: { orgScoped: boolean },
): ContactChannels {
  if (!facts) return { inApp: true, push: false, email: false };
  if (!facts.account || facts.account.disabled) return NONE;
  if (!scope.orgScoped || facts.account.platformRole === "gridmaster") return ALL;
  if (!facts.membership || facts.employee?.status === "removed") return NONE;
  if (facts.employee?.suspended) return { inApp: true, push: false, email: false };
  return ALL;
}

/** Reads the facts for `orgId`, or only the account's when it is null. */
export async function loadContactFacts(
  db: SupabaseClient,
  userId: string,
  orgId: string | null,
): Promise<ContactFacts | null> {
  const [profile, membership, employee] = await Promise.all([
    db
      .from("profiles")
      .select("platform_role, deactivated_at, terminated_at")
      .eq("id", userId)
      .maybeSingle(),
    orgId
      ? db
          .from("organization_memberships")
          .select("user_id")
          .eq("user_id", userId)
          .eq("org_id", orgId)
          .is("archived_at", null)
          .maybeSingle()
      : null,
    orgId
      ? db
          .from("employees")
          .select("status, suspended_at")
          .eq("user_id", userId)
          .eq("org_id", orgId)
          .maybeSingle()
      : null,
  ]);

  const error = profile.error ?? membership?.error ?? employee?.error;
  if (error) {
    logger.error({ error, userId, orgId }, "Couldn't read whether an alert's reader can sign in");
    return null;
  }

  const profileRow = profile.data as {
    platform_role: string | null;
    deactivated_at: string | null;
    terminated_at: string | null;
  } | null;
  const employeeRow = employee?.data as {
    status: string | null;
    suspended_at: string | null;
  } | null;
  return {
    account: profileRow
      ? {
          platformRole: profileRow.platform_role,
          disabled: profileRow.deactivated_at != null || profileRow.terminated_at != null,
        }
      : null,
    membership: membership?.data != null,
    employee: employeeRow
      ? { status: employeeRow.status, suspended: employeeRow.suspended_at != null }
      : null,
  };
}
