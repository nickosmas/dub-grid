import "server-only";

import { CURRENT_TERMS_VERSION, hasAcceptedCurrentTerms } from "@dubgrid/domain";
import type { TermsAcceptanceStatus } from "@dubgrid/domain";
import { getServiceClient } from "@/lib/supabase-service";

export type { TermsAcceptanceStatus };

export async function fetchTermsAcceptanceStatus(userId: string): Promise<TermsAcceptanceStatus> {
  const { data, error } = await getServiceClient()
    .from("profiles")
    .select("terms_version")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  const acceptedVersion = data?.terms_version ?? null;
  return {
    acceptedCurrentTerms: hasAcceptedCurrentTerms(acceptedVersion),
    acceptedVersion,
  };
}

export async function recordCurrentTermsAcceptance(
  userId: string,
  acceptedAt = new Date().toISOString(),
): Promise<void> {
  const serviceClient = getServiceClient();
  const [{ error: insertError }, { error: updateError }] = await Promise.all([
    serviceClient.from("terms_acceptances").insert({
      user_id: userId,
      terms_version: CURRENT_TERMS_VERSION,
    }),
    serviceClient
      .from("profiles")
      .update({
        terms_accepted_at: acceptedAt,
        terms_version: CURRENT_TERMS_VERSION,
      })
      .eq("id", userId),
  ]);

  if (insertError && !insertError.message?.includes("duplicate")) {
    throw insertError;
  }

  if (updateError) {
    throw updateError;
  }
}
