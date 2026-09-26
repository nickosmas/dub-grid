import type { SupabaseClient } from "@supabase/supabase-js";
import { throwUnlessNotFound } from "./person-record";

export interface PersonTarget {
  userId: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
}

/** The account to change, or null for none and for a Gridmaster's own kind. */
export async function loadPersonTarget(
  client: SupabaseClient,
  userId: string,
): Promise<PersonTarget | null> {
  const [{ data: profile, error }, { data: authData, error: authError }] = await Promise.all([
    client
      .from("profiles")
      .select("platform_role, first_name, last_name")
      .eq("id", userId)
      .maybeSingle(),
    client.auth.admin.getUserById(userId),
  ]);
  if (error) throw error;
  throwUnlessNotFound(authError);
  const authUser = authData?.user;
  if (!profile || !authUser || profile.platform_role === "gridmaster") return null;
  return {
    userId,
    email: authUser.email ?? "",
    firstName: (profile.first_name as string | null) ?? null,
    lastName: (profile.last_name as string | null) ?? null,
  };
}

/** The organization a notice names: their first active membership, if any. */
export async function loadPrimaryOrgId(
  client: SupabaseClient,
  userId: string,
): Promise<string | null> {
  const { data, error } = await client
    .from("organization_memberships")
    .select("org_id")
    .eq("user_id", userId)
    .is("archived_at", null)
    .order("joined_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data?.org_id as string | undefined) ?? null;
}
