import { NextRequest, NextResponse } from "next/server";
import { requireOrgPermissions } from "@/app/api/shared/permissions";
import logger from "@/lib/logger";
import * as Sentry from "@/lib/sentry";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { loadOperationsReport } from "@/features/reports/server/operations";
import { apiErrorResponse } from "@/lib/error-handling";
import { operationsQuerySchema, parseOperationsFilters, parseOperationsRange } from "./params";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const parsed = operationsQuerySchema.safeParse(
    Object.fromEntries(req.nextUrl.searchParams.entries()),
  );
  if (!parsed.success) {
    return NextResponse.json({ error: "Check the report filters and try again." }, { status: 400 });
  }

  let range;
  let filters;
  try {
    range = parseOperationsRange(parsed.data);
    filters = parseOperationsFilters(parsed.data, range);
  } catch (error) {
    return apiErrorResponse(error, "Check the report filters and try again.", 400);
  }

  try {
    const auth = await requireOrgPermissions(
      req,
      parsed.data.orgId,
      (permissions) => permissions.isSuperAdmin === true || permissions.canViewReports,
    );
    if ("response" in auth) {
      return auth.response;
    }

    if (!(await isFeatureEnabled("reports"))) {
      return NextResponse.json(
        { error: "Reports are unavailable right now. Try again in a moment." },
        { status: 503 },
      );
    }

    const payload = await loadOperationsReport(auth.serviceClient, {
      orgId: parsed.data.orgId,
      range,
      filters,
    });

    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    Sentry.captureException(error, { extra: { context: "reports.operations" } });
    logger.error({ error, orgId: parsed.data.orgId }, "Reports load failed");
    return NextResponse.json(
      { error: "We couldn't load your reports. Refresh and try again." },
      { status: 500 },
    );
  }
}
