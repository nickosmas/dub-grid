import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  createRequestSupabaseClient,
  requireAuthenticatedUserWithClaims,
} from "@/lib/api-auth";
import { validateCsrfOrigin } from "@/lib/csrf";
import { checkRateLimit, testSandboxLimiter } from "@/lib/rate-limit";
import { getServiceClient } from "@/lib/supabase-service";
import { requireOrgPermissions } from "@/app/api/shared/permissions";
import { rowToOrganization } from "@/lib/db/mappers";
import type { DbOrganization } from "@dubgrid/db-types";
import {
  createSandboxWorkspace,
  deleteSandboxWorkspace,
  findActiveSandboxForUser,
} from "@/features/test-sandbox/server";

export const dynamic = "force-dynamic";

const requestSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("create"),
    sourceOrgId: z.string().uuid().optional(),
  }),
  z.object({
    action: z.literal("exit"),
    sandboxOrgId: z.string().uuid(),
  }),
]);

function getClaimOrgId(claims: { org_id?: unknown }): string | null {
  return typeof claims.org_id === "string" && claims.org_id.length > 0
    ? claims.org_id
    : null;
}

const CLIENT_ERROR_MESSAGES = new Set([
  "Choose an active workspace before opening the test sandbox.",
  "Choose a real workspace before opening the test sandbox.",
  "Source workspace not found",
  "Only sandbox workspaces can be reset",
  "Only the sandbox owner can reset this test sandbox",
  "Sandbox source workspace is unavailable",
  "Choose a source workspace before opening the test sandbox.",
]);

export async function POST(req: NextRequest) {
  const csrfError = validateCsrfOrigin(req);
  if (csrfError) return csrfError;

  const auth = await requireAuthenticatedUserWithClaims(req);
  if ("response" in auth) return auth.response;

  if (process.env.NODE_ENV === "production") {
    const { limited, reset, misconfigured } = await checkRateLimit(
      testSandboxLimiter,
      `test-sandbox:${auth.user.id}`,
    );
    if (misconfigured) {
      return NextResponse.json(
        { error: "Test sandbox temporarily unavailable" },
        { status: 503 },
      );
    }
    if (limited) {
      return NextResponse.json(
        { error: "Too many test sandbox requests" },
        {
          status: 429,
          headers: {
            "Retry-After": String(
              Math.max(1, Math.ceil(((reset ?? Date.now()) - Date.now()) / 1000)),
            ),
          },
        },
      );
    }
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const serviceClient = getServiceClient();
  const requestClient = createRequestSupabaseClient(req);

  try {
    if (parsed.data.action === "exit") {
      const result = await deleteSandboxWorkspace({
        serviceClient,
        requestClient,
        actor: auth.user,
        sandboxOrgId: parsed.data.sandboxOrgId,
      });
      return NextResponse.json({
        success: true,
        sourceOrgSlug: result.sourceOrgSlug,
      });
    }

    // action === "create" — enter sandbox mode.
    // Singleton: if the user already owns an active sandbox, switch them
    // into it instead of cloning a new one.
    const existing = await findActiveSandboxForUser(serviceClient, auth.user.id);
    if (existing) {
      const { error: switchError } = await requestClient.rpc("switch_org", {
        target_org_id: existing.id,
      });
      if (switchError) throw switchError;
      return NextResponse.json({
        success: true,
        sandbox: {
          org: rowToOrganization(existing as DbOrganization),
          sourceOrgId: existing.sandbox_source_org_id ?? null,
          employeeCount: 0,
          reused: true,
        },
      });
    }

    const sourceOrgId =
      parsed.data.sourceOrgId ?? getClaimOrgId(auth.claims);
    if (!sourceOrgId) {
      return NextResponse.json(
        { error: "Choose a source workspace before opening the test sandbox." },
        { status: 400 },
      );
    }

    const orgAuth = await requireOrgPermissions(req, sourceOrgId, () => true, {
      allowDuringSetup: true,
      allowLockedWorkspace: true,
    });
    if ("response" in orgAuth) {
      return orgAuth.response;
    }

    const sandbox = await createSandboxWorkspace({
      serviceClient,
      requestClient,
      actor: auth.user,
      sourceOrgId,
      archiveExistingActive: true,
    });

    return NextResponse.json({
      success: true,
      sandbox,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "We couldn't prepare the test sandbox right now.";
    return NextResponse.json(
      { error: message },
      { status: CLIENT_ERROR_MESSAGES.has(message) ? 400 : 500 },
    );
  }
}
