import { NextResponse, type NextRequest } from "next/server";
import {
  mobileMeScheduleResponseSchema,
  mobileScheduleQuerySchema,
} from "@dubgrid/contracts";
import { loadMobileMeSchedulePayload } from "@dubgrid/mobile-api-core";
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

  let range: ReturnType<typeof resolveMobileDateRange>;
  try {
    range = resolveMobileDateRange(queryResult.data);
  } catch {
    return json({ error: "Invalid query" }, { status: 400 });
  }
  const payload = await loadMobileMeSchedulePayload(auth, range, {
    fetchLinkedEmployeeForUser,
    fetchMobileScheduleEntries,
  });
  return json(mobileMeScheduleResponseSchema.parse(payload));
}
