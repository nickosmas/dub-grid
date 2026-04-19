import { NextResponse, type NextRequest } from "next/server";
import {
  mobileOrgScheduleResponseSchema,
  mobileScheduleQuerySchema,
} from "@dubgrid/contracts";
import {
  fetchMobileScheduleEntries,
  resolveMobileDateRange,
  requireMobileAuth,
} from "@/features/mobile/server";
import { createMobileOptionsHandler, withMobileCors } from "./cors";

export const dynamic = "force-dynamic";
const CORS_METHODS = ["GET", "OPTIONS"] as const;

export const OPTIONS = createMobileOptionsHandler(CORS_METHODS);

function canViewOrgSchedule(
  level: number,
  permissions: {
    canApproveShiftRequests: boolean;
    canManageEmployees: boolean;
  },
) {
  return level >= 2 || permissions.canApproveShiftRequests || permissions.canManageEmployees;
}

export async function GET(req: NextRequest) {
  const json = (body: unknown, init?: ResponseInit) =>
    withMobileCors(req, NextResponse.json(body, init), CORS_METHODS);
  const auth = await requireMobileAuth(req);
  if ("response" in auth) return withMobileCors(req, auth.response, CORS_METHODS);

  if (!canViewOrgSchedule(auth.permissions.level, auth.permissions)) {
    return json({ error: "Unauthorized" }, { status: 403 });
  }

  const queryResult = mobileScheduleQuerySchema.safeParse(
    Object.fromEntries(req.nextUrl.searchParams.entries()),
  );
  if (!queryResult.success) {
    return json({ error: "Invalid query" }, { status: 400 });
  }

  const range = resolveMobileDateRange(queryResult.data);
  const entries = await fetchMobileScheduleEntries(auth.serviceClient, {
    orgId: auth.currentOrg.id,
    ...range,
  });

  return json(
    mobileOrgScheduleResponseSchema.parse({
      range,
      entries,
    }),
  );
}
