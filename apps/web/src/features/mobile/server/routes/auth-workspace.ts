import { NextResponse, type NextRequest } from "next/server";
import { mobileWorkspaceLookupResponseSchema } from "@dubgrid/contracts";
import { getServiceClient } from "@/lib/supabase-service";
import { RESERVED_SUBDOMAINS } from "@/lib/subdomain";
import { createMobileOptionsHandler, withMobileCors } from "./cors";

export const dynamic = "force-dynamic";
const CORS_METHODS = ["GET", "OPTIONS"] as const;

export const OPTIONS = createMobileOptionsHandler(CORS_METHODS);

export async function GET(req: NextRequest) {
  const json = (body: unknown, init?: ResponseInit) =>
    withMobileCors(req, NextResponse.json(body, init), CORS_METHODS);
  const slug = req.nextUrl.searchParams.get("slug")?.trim().toLowerCase() ?? "";

  if (
    !slug ||
    RESERVED_SUBDOMAINS.has(slug) ||
    !/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(slug)
  ) {
    return json(
      { error: "Enter a valid workspace slug." },
      { status: 400 },
    );
  }

  const serviceClient = getServiceClient();
  const { data, error } = await serviceClient
    .from("organizations")
    .select("id, name, slug")
    .eq("slug", slug)
    .maybeSingle();

  if (error) {
    return json(
      { error: "We could not verify that workspace right now." },
      { status: 503 },
    );
  }

  if (!data || typeof data.slug !== "string") {
    return json(
      { error: "No workspace matched that slug." },
      { status: 404 },
    );
  }

  return json(
    mobileWorkspaceLookupResponseSchema.parse({
      workspace: {
        id: data.id as string,
        name: data.name as string,
        slug: data.slug,
      },
    }),
  );
}
