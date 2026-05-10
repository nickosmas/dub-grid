import { NextRequest, NextResponse } from "next/server";
import { requireOrgPermissions } from "@/app/api/shared/permissions";
import logger from "@/lib/logger";
import * as Sentry from "@/lib/sentry";
import { loadOperationsReport } from "@/features/reports/server/operations";
import {
  operationsQuerySchema,
  parseOperationsFilters,
  parseOperationsRange,
} from "./params";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const parsed = operationsQuerySchema.safeParse(
    Object.fromEntries(req.nextUrl.searchParams.entries()),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Check the report filters and try again." },
      { status: 400 },
    );
  }

  let range;
  let filters;
  try {
    range = parseOperationsRange(parsed.data);
    filters = parseOperationsFilters(parsed.data, range);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid filters" },
      { status: 400 },
    );
  }

  try {
    const auth = await requireOrgPermissions(
      req,
      parsed.data.orgId,
      (permissions) =>
        permissions.role === "admin" || permissions.isSuperAdmin === true,
    );
    if ("response" in auth) {
      return auth.response;
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
    return NextResponse.json({ error: "Failed to load reports" }, { status: 500 });
  }
}
