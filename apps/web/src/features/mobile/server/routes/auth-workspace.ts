import { NextResponse, type NextRequest } from "next/server";
import { mobileWorkspaceLookupResponseSchema } from "@dubgrid/contracts";
import {
  findMobileWorkspaceBySlug,
  isValidMobileWorkspaceSlug,
  normalizeMobileWorkspaceSlug,
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
  const slug = normalizeMobileWorkspaceSlug(
    req.nextUrl.searchParams.get("slug"),
  );

  if (!isValidMobileWorkspaceSlug(slug, RESERVED_SUBDOMAINS)) {
    return json(
      { error: "Enter a valid workspace slug." },
      { status: 400 },
    );
  }

  const serviceClient = getServiceClient();
  try {
    const workspace = await findMobileWorkspaceBySlug(serviceClient, slug);

    if (!workspace) {
      return json(
        { error: "No workspace matched that slug." },
        { status: 404 },
      );
    }

    return json(
      mobileWorkspaceLookupResponseSchema.parse({
        workspace,
      }),
    );
  } catch {
    return json(
      { error: "We could not verify that workspace right now." },
      { status: 503 },
    );
  }
}
