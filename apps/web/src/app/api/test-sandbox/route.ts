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
import {
  archiveSandboxWorkspace,
  createSandboxWorkspace,
  resolveSandboxWorkspaceReset,
} from "@/features/test-sandbox/server";

export const dynamic = "force-dynamic";

const requestSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("create"),
    sourceOrgId: z.string().uuid().optional(),
  }),
  z.object({
    action: z.literal("reset"),
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
]);

export async function POST(req: NextRequest) {
  const csrfError = validateCsrfOrigin(req);
  if (csrfError) return csrfError;

  const auth = await requireAuthenticatedUserWithClaims(req);
  if ("response" in auth) return auth.response;

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
    const resetTarget =
      parsed.data.action === "reset" ? parsed.data.sandboxOrgId : null;
    const sourceOrgId =
      parsed.data.action === "create"
        ? parsed.data.sourceOrgId ?? getClaimOrgId(auth.claims)
        : (
            await resolveSandboxWorkspaceReset({
              serviceClient,
              actor: auth.user,
              sandboxOrgId: parsed.data.sandboxOrgId,
            })
          ).sourceOrgId;

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
      archiveExistingActive: parsed.data.action === "create",
    });

    if (resetTarget) {
      await archiveSandboxWorkspace({
        serviceClient,
        actor: auth.user,
        sandboxOrgId: resetTarget,
      });
    }

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
