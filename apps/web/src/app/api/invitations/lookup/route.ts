import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getServiceClient } from "@/lib/supabase-service";

const querySchema = z.object({
  token: z.string().min(1),
});

export async function GET(req: NextRequest) {
  try {
    const parsed = querySchema.safeParse({
      token: req.nextUrl.searchParams.get("token") ?? "",
    });
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid query" }, { status: 400 });
    }

    const { data, error } = await getServiceClient()
      .from("invitations")
      .select("organizations(name, slug)")
      .eq("token", parsed.data.token)
      .maybeSingle();

    if (error) {
      throw error;
    }

    const organization =
      (data?.organizations as { name?: string | null; slug?: string | null } | null) ??
      null;

    return NextResponse.json({
      orgName:
        typeof organization?.name === "string" && organization.name.length > 0
          ? organization.name
          : null,
      orgSlug:
        typeof organization?.slug === "string" && organization.slug.length > 0
          ? organization.slug
          : null,
    });
  } catch (error) {
    console.error("invitation lookup GET failed", error);
    return NextResponse.json(
      { error: "Failed to look up invitation" },
      { status: 500 },
    );
  }
}
