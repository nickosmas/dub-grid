import { NextResponse, type NextRequest } from "next/server";
import {
  mobileMeScheduleResponseSchema,
  mobileScheduleQuerySchema,
} from "@dubgrid/contracts";
import {
  fetchLinkedEmployeeForUser,
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

  const linkedEmployee = await fetchLinkedEmployeeForUser(
    auth.serviceClient,
    auth.currentOrg.id,
    auth.user.id,
  );
  const range = resolveMobileDateRange(queryResult.data);

  if (!linkedEmployee) {
    return json(
      mobileMeScheduleResponseSchema.parse({
        employee: null,
        range,
        entries: [],
      }),
    );
  }

  const entries = await fetchMobileScheduleEntries(auth.serviceClient, {
    orgId: auth.currentOrg.id,
    employeeId: linkedEmployee.id,
    ...range,
  });

  return json(
    mobileMeScheduleResponseSchema.parse({
      employee: {
        id: linkedEmployee.id,
        firstName: linkedEmployee.firstName,
        lastName: linkedEmployee.lastName,
        status: linkedEmployee.status,
        focusAreaIds: linkedEmployee.focusAreaIds,
      },
      range,
      entries,
    }),
  );
}
