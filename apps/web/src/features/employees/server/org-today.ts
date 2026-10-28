import type { SupabaseClient } from "@supabase/supabase-js";
import { getIsoDateInTimeZone } from "@dubgrid/schedule-core";

/** Today (YYYY-MM-DD) in the organization's timezone. */
export async function fetchOrgToday(serviceClient: SupabaseClient, orgId: string): Promise<string> {
  const { data, error } = await serviceClient
    .from("organizations")
    .select("timezone")
    .eq("id", orgId)
    .single();
  if (error) throw error;
  return getIsoDateInTimeZone(new Date(), (data as { timezone: string | null }).timezone);
}
