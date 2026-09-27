import { NextResponse, type NextRequest } from "next/server";
import { mobileBootstrapResponseSchema } from "@dubgrid/contracts";
import { loadMobileBootstrapPayload } from "@dubgrid/mobile-api-core";
import {
  fetchMobileAbsenceTypes,
  fetchMobileCertifications,
  fetchMobileDepartments,
  fetchMobileFocusAreas,
  fetchMobileIndicatorTypes,
  fetchMobileRoles,
  fetchLinkedEmployeeForUser,
  fetchMobileTermsAcceptedVersion,
  fetchMobileUnreadNotificationCount,
  mapOrganizationToMobileConfig,
  requireMobileAuth,
} from "@/features/mobile/server";
import { resolveMfaReenrollRequired } from "@/features/account/server";
import logger from "@/lib/logger";
import { createMobileOptionsHandler, withMobileCors } from "./cors";
import { withTiming, type Timer } from "@/lib/server-timing";

export const dynamic = "force-dynamic";
const CORS_METHODS = ["GET", "OPTIONS"] as const;

export const OPTIONS = createMobileOptionsHandler(CORS_METHODS);

async function handleGET(req: NextRequest, timer: Timer) {
  const json = (body: unknown, init?: ResponseInit) =>
    withMobileCors(req, NextResponse.json(body, init), CORS_METHODS);
  const auth = await timer.time("auth", () => requireMobileAuth(req));
  if ("response" in auth) return withMobileCors(req, auth.response, CORS_METHODS);

  const payload = await timer.time("fanout", () =>
    loadMobileBootstrapPayload(auth, {
      fetchLinkedEmployeeForUser,
      fetchMobileUnreadNotificationCount,
      fetchMobileAbsenceTypes,
      fetchMobileFocusAreas,
      fetchMobileRoles,
      fetchMobileCertifications,
      fetchMobileDepartments,
      fetchMobileIndicatorTypes,
      fetchTermsAcceptedVersion: fetchMobileTermsAcceptedVersion,
      // A failed check must not take the app down; web lets them through too.
      fetchMfaReenrollRequired: async (userId: string) => {
        try {
          return await resolveMfaReenrollRequired(userId);
        } catch (error) {
          logger.warn({ error }, "mobile bootstrap two-factor re-enrollment check failed");
          return false;
        }
      },
      mapOrganizationToMobileConfig,
    }),
  );

  return json(mobileBootstrapResponseSchema.parse(payload));
}

export const GET = withTiming(handleGET);
