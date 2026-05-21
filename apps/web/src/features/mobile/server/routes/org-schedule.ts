import { NextResponse, type NextRequest } from "next/server";
import {
  mobileOrgScheduleResponseSchema,
  mobileScheduleQuerySchema,
} from "@dubgrid/contracts";
import {
  loadMobileOrgSchedulePayload,
  MobileApiAuthorizationError,
} from "@dubgrid/mobile-api-core";
import {
  fetchMobileScheduleEntries,
  resolveMobileDateRange,
  requireMobileAuth,
} from "@/features/mobile/server";
import { createMobileOptionsHandler, withMobileCors } from "./cors";

export const dynamic = "force-dynamic";
const CORS_METHODS = ["GET", "OPTIONS"] as const;

export const OPTIONS = createMobileOptionsHandler(CORS_METHODS);

export async function GET(req: NextRequest) {
  const json = (body: unknown, init?: ResponseInit) =>
    withMobileCors(req, NextResponse.json(body, init), CORS_METHODS);
  const auth = await requireMobileAuth(req);
  if ("response" in auth) return withMobileCors(req, auth.response, CORS_METHODS);

  const queryResult = mobileScheduleQuerySchema.safeParse(
    Object.fromEntries(req.nextUrl.searchParams.entries()),
  );
  if (!queryResult.success) {
    return json({ error: "Invalid query" }, { status: 400 });
  }

  let range: ReturnType<typeof resolveMobileDateRange>;
  try {
    range = resolveMobileDateRange(queryResult.data);
  } catch {
    return json({ error: "Invalid query" }, { status: 400 });
  }
  try {
    const payload = await loadMobileOrgSchedulePayload(auth, range, {
      fetchMobileScheduleEntries,
    });
    return json(mobileOrgScheduleResponseSchema.parse(payload));
  } catch (error) {
    if (error instanceof MobileApiAuthorizationError) {
      return json(
        { error: "You don't have permission to view the organization schedule." },
        { status: 403 },
      );
    }

    throw error;
  }
}
