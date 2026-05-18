import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthenticatedUserWithClaims } from "@/lib/api-auth";
import { validateCsrfOrigin } from "@/lib/csrf";
import { getServiceClient } from "@/lib/supabase-service";
import {
  SANDBOX_COOKIE_NAME,
  encodeSandboxCookieValue,
} from "@/lib/sandbox-cookie";
import {
  createSandboxForUser,
  deleteSandboxForUser,
  findActiveSandboxForUser,
} from "@/features/test-sandbox/server";

export const dynamic = "force-dynamic";

const requestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("enter") }),
  z.object({ action: z.literal("exit") }),
]);

function getClaimOrgId(claims: { org_id?: unknown }): string | null {
  return typeof claims.org_id === "string" && claims.org_id.length > 0
    ? claims.org_id
    : null;
}

function readSandboxCookie(req: NextRequest): string | null {
  const cookieHeader = req.headers.get("cookie") ?? "";
  const prefix = `${SANDBOX_COOKIE_NAME}=`;
  const cookie = cookieHeader
    .split(/;\s*/)
    .find((c) => c.startsWith(prefix));
  if (!cookie) return null;
  try {
    const data = JSON.parse(decodeURIComponent(cookie.slice(prefix.length))) as
      | { sandboxOrgId?: unknown }
      | null;
    return typeof data?.sandboxOrgId === "string" ? data.sandboxOrgId : null;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  const csrfError = validateCsrfOrigin(req);
  if (csrfError) return csrfError;

  const auth = await requireAuthenticatedUserWithClaims(req);
  if ("response" in auth) return auth.response;

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

  try {
    if (parsed.data.action === "exit") {
      const cookieSandboxId = readSandboxCookie(req);
      if (!cookieSandboxId) {
        // Already not in sandbox mode — treat as a no-op success so the
        // client gets to its happy path either way.
        const response = NextResponse.json({ success: true });
        response.cookies.set(SANDBOX_COOKIE_NAME, "", {
          path: "/",
          maxAge: 0,
        });
        return response;
      }
      await deleteSandboxForUser({
        serviceClient,
        actor: auth.user,
        sandboxOrgId: cookieSandboxId,
      });
      const response = NextResponse.json({ success: true });
      response.cookies.set(SANDBOX_COOKIE_NAME, "", { path: "/", maxAge: 0 });
      return response;
    }

    // action === "enter"
    const sourceOrgId = getClaimOrgId(auth.claims);
    if (!sourceOrgId) {
      return NextResponse.json(
        { error: "Pick a workspace before entering sandbox mode." },
        { status: 400 },
      );
    }

    const existing = await findActiveSandboxForUser(
      serviceClient,
      auth.user.id,
    );
    const sandbox =
      existing ??
      (await createSandboxForUser({
        serviceClient,
        actor: auth.user,
        sourceOrgId,
      }));

    const response = NextResponse.json({
      success: true,
      sandbox: { id: sandbox.id, slug: sandbox.slug, reused: Boolean(existing) },
    });
    response.cookies.set(
      SANDBOX_COOKIE_NAME,
      encodeSandboxCookieValue({
        sandboxOrgId: sandbox.id,
        userId: auth.user.id,
      }),
      {
        path: "/",
        httpOnly: false,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        // Effectively a session cookie — no max-age. Clears when the
        // browser session ends, or when /api/test-sandbox exit clears it.
      },
    );
    return response;
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "We couldn't toggle sandbox mode right now.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
