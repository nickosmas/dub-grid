import { NextRequest, NextResponse } from "next/server";
import { API_ERRORS } from "@dubgrid/client-errors";
import { z } from "zod";
import { getServiceClient } from "@/lib/supabase-service";
import logger from "@/lib/logger";

const querySchema = z.object({
  token: z.string().min(1),
});

export async function GET(req: NextRequest) {
  try {
    const parsed = querySchema.safeParse({
      token: req.nextUrl.searchParams.get("token") ?? "",
    });
    if (!parsed.success) {
      return NextResponse.json({ error: API_ERRORS.INVALID_REQUEST }, { status: 400 });
    }

    // Only resolve org metadata for a LIVE invitation (not expired, accepted, or
    // revoked) — otherwise the endpoint leaks org name/slug for any token-shaped
    // value and lets expired tokens still surface org details.
    const { data, error } = await getServiceClient()
      .from("invitations")
      .select("organizations(name, slug)")
      .eq("token", parsed.data.token)
      .gt("expires_at", new Date().toISOString())
      .is("accepted_at", null)
      .is("revoked_at", null)
      .maybeSingle();

    if (error) {
      throw error;
    }

    const organization =
      (data?.organizations as { name?: string | null; slug?: string | null } | null) ?? null;

    if (!organization) {
      // Unknown / expired / accepted / revoked — same 404 for all so a caller
      // can't distinguish a real-but-dead token from a non-existent one.
      return NextResponse.json(
        { error: "Invitation not found or no longer valid" },
        { status: 404 },
      );
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
