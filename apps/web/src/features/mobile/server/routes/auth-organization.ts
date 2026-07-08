import { NextResponse, type NextRequest } from "next/server";
import { mobileOrganizationLookupResponseSchema } from "@dubgrid/contracts";
import {
  findMobileOrganizationBySlug,
  isValidMobileOrgSlug,
  normalizeMobileOrgSlug,
} from "@dubgrid/mobile-api-core";
import { getServiceClient } from "@/lib/supabase-service";
import { RESERVED_SUBDOMAINS } from "@/lib/subdomain";
import { createMobileOptionsHandler, withMobileCors } from "./cors";

export const dynamic = "force-dynamic";
const CORS_METHODS = ["GET", "OPTIONS"] as const;

export const OPTIONS = createMobileOptionsHandler(CORS_METHODS);

export async function GET(req: NextRequest) {
  const json = (body: unknown, init?: ResponseInit) =>
    withMobileCors(req, NextResponse.json(body, init), CORS_METHODS);
  const slug = normalizeMobileOrgSlug(req.nextUrl.searchParams.get("slug"));

  if (!isValidMobileOrgSlug(slug, RESERVED_SUBDOMAINS)) {
    return json({ error: "Enter a valid organization slug." }, { status: 400 });
  }

  const serviceClient = getServiceClient();
  try {
    const organization = await findMobileOrganizationBySlug(serviceClient, slug);

    if (!organization) {
      return json({ error: "No organization matched that slug." }, { status: 404 });
    }

    return json(
      mobileOrganizationLookupResponseSchema.parse({
        organization,
      }),
    );
  } catch {
    return json({ error: "We could not verify that organization right now." }, { status: 503 });
  }
}
