import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getServiceClient } from "@/lib/supabase-service";
import logger from "@/lib/logger";
import { apiLimiter, checkRateLimit } from "@/lib/rate-limit";
import { retryAfterSeconds } from "@/lib/retry-after";
import { API_ERRORS } from "@dubgrid/client-errors";
import { deadInvitationResponse } from "@/lib/auth/invitation-capability";

const querySchema = z.object({
  token: z.string().uuid(),
});

export async function GET(req: NextRequest) {
  try {
    // The abuse boundary declares this endpoint source-limited: it is
    // unauthenticated and answers with organization context, so an unlimited
    // caller could sweep token-shaped values looking for a live invitation.
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "anonymous";
    const { limited, reset, misconfigured } = await checkRateLimit(
      apiLimiter,
      `invite-lookup:${ip}`,
    );
    if (misconfigured) {
      // A limiter that cannot answer is unavailable, not a throttle.
      return NextResponse.json({ error: API_ERRORS.SERVICE_UNAVAILABLE }, { status: 503 });
    }
    if (limited) {
      const retryAfter = retryAfterSeconds(reset);
      return NextResponse.json(
        { error: "Too many requests" },
        { status: 429, headers: { "Retry-After": String(retryAfter) } },
      );
    }

    const parsed = querySchema.safeParse({
      token: req.nextUrl.searchParams.get("token") ?? "",
    });
    if (!parsed.success) {
      return deadInvitationResponse();
    }

    // Only resolve org metadata for a LIVE invitation (not expired, accepted, or
    // revoked) — otherwise the endpoint leaks org name/slug for any token-shaped
    // value and lets expired tokens still surface org details.
    const { data, error } = await getServiceClient()
      .from("invitations")
      .select("organizations!inner(name, slug, archived_at)")
      .eq("token", parsed.data.token)
      .gt("expires_at", new Date().toISOString())
      .is("accepted_at", null)
      .is("revoked_at", null)
      .is("organizations.archived_at", null)
      .maybeSingle();

    if (error) {
      throw error;
    }

    const organization =
      (data?.organizations as { name?: string | null; slug?: string | null } | null) ?? null;

    if (!organization) {
      // Unknown / expired / accepted / revoked — same 404 for all so a caller
      // can't distinguish a real-but-dead token from a non-existent one.
      return deadInvitationResponse();
    }

    return NextResponse.json({
      orgName:
        typeof organization.name === "string" && organization.name.length > 0
          ? organization.name
          : null,
      orgSlug:
        typeof organization.slug === "string" && organization.slug.length > 0
          ? organization.slug
          : null,
    });
  } catch (error) {
    logger.error({ error }, "invitation lookup GET failed");
    return NextResponse.json(
      { error: "We couldn't find that invitation. Check the link and try again." },
      { status: 500 },
    );
  }
}
