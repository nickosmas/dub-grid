import { NextRequest, NextResponse } from "next/server";
import type { Organization } from "@dubgrid/domain";
import {
  fetchMobileOrganizationMembershipRows,
  fetchMobileOrganizationRowById,
  fetchMobileProfilePlatformRole,
} from "@dubgrid/data-access";
import {
  extractMobileBearerToken,
  MobileApiRequestError,
  resolveMobileAuthContext,
  type ResolvedMobileAuthContext,
} from "@dubgrid/mobile-api-core";
import { rowToOrganization } from "@/lib/db/mappers";
import { getServiceClient } from "@/lib/supabase-service";
import { createMobileUserClient } from "./client";

export type MobileAuthContext = ResolvedMobileAuthContext<Organization>;

export async function requireMobileAuth(
  req: NextRequest,
): Promise<MobileAuthContext | { response: NextResponse }> {
  const accessToken = extractMobileBearerToken(
    req.headers.get("authorization"),
  );
  if (!accessToken) {
    return {
      response: NextResponse.json({ error: "Unauthenticated" }, { status: 401 }),
    };
  }

  try {
    return await resolveMobileAuthContext({
      accessToken,
      serviceClient: getServiceClient(),
      createUserClient: createMobileUserClient,
      fetchMemberships: fetchMobileOrganizationMembershipRows,
      fetchOrganization: fetchMobileOrganizationRowById,
      fetchPlatformRole: fetchMobileProfilePlatformRole,
      mapOrganization: rowToOrganization,
    });
  } catch (error) {
    if (error instanceof MobileApiRequestError) {
      return {
        response: NextResponse.json(
          { error: error.message },
          { status: error.status },
        ),
      };
    }

    return {
      response: NextResponse.json(
        { error: "We could not verify this session right now." },
        { status: 503 },
      ),
    };
  }
}
