import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getServiceClient } from "@/lib/supabase-service";
import { requireAuthenticatedUserWithClaims } from "@/lib/api-auth";
import { validateCsrfOrigin } from "@/lib/csrf";
import { API_ERRORS } from "@dubgrid/client-errors";

const actorNamesSchema = z.object({
  orgId: z.string().uuid(),
  ids: z.array(z.string().uuid()).min(1).max(200),
});

function formatDisplayName(firstName: string | null, lastName: string | null): string | null {
  const name = [firstName?.trim(), lastName?.trim()].filter(Boolean).join(" ").trim();
  return name || null;
}

async function ensureViewerCanAccessOrg(orgId: string, userId: string): Promise<boolean> {
  const serviceClient = getServiceClient();
  const { data, error } = await serviceClient
    .from("organization_memberships")
    .select("user_id")
    .eq("org_id", orgId)
    .eq("user_id", userId)
    .is("archived_at", null)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return !!data;
}

export async function POST(req: NextRequest) {
  const csrfError = validateCsrfOrigin(req);
  if (csrfError) return csrfError;

  try {
    const auth = await requireAuthenticatedUserWithClaims(req);
    if ("response" in auth) {
      return auth.response;
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: API_ERRORS.INVALID_BODY }, { status: 400 });
    }

    const parsed = actorNamesSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: API_ERRORS.INVALID_INPUT }, { status: 400 });
    }

    if (auth.claims.platform_role !== "gridmaster") {
      const hasAccess = await ensureViewerCanAccessOrg(parsed.data.orgId, auth.user.id);
      if (!hasAccess) {
        return NextResponse.json({ error: API_ERRORS.FORBIDDEN }, { status: 403 });
      }
    }

    const ids = Array.from(new Set(parsed.data.ids));
    const serviceClient = getServiceClient();
    const { data: profiles, error: profileError } = await serviceClient
      .from("profiles")
      .select("id, first_name, last_name")
      .in("id", ids);

    if (profileError) {
      throw profileError;
    }

    const names: Record<string, string> = {};
    for (const row of profiles ?? []) {
      const name = formatDisplayName(
        (row.first_name as string | null) ?? null,
        (row.last_name as string | null) ?? null,
      );
      if (name) {
        names[row.id as string] = name;
      }
    }

    const unresolvedIds = ids.filter((id) => !names[id]);
    if (unresolvedIds.length > 0) {
      const { data: employees, error: employeeError } = await serviceClient
        .from("employees")
        .select("user_id, first_name, last_name")
        .eq("org_id", parsed.data.orgId)
        .in("user_id", unresolvedIds);

      if (employeeError) {
        throw employeeError;
      }

      for (const row of employees ?? []) {
        const userId = (row.user_id as string | null) ?? null;
        if (!userId) continue;
        const name = formatDisplayName(
          (row.first_name as string | null) ?? null,
          (row.last_name as string | null) ?? null,
        );
        if (name) {
          names[userId] = name;
        }
      }
    }

    return NextResponse.json({ names });
  } catch (error) {
    console.error("schedule actor names POST failed", error);
    return NextResponse.json(
      { error: "Failed to load schedule actor names" },
      { status: 500 },
    );
  }
}
