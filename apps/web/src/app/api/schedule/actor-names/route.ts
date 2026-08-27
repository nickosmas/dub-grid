import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validateCsrfOrigin } from "@/lib/csrf";
import { API_ERRORS } from "@dubgrid/client-errors";
import logger from "@/lib/logger";
import { requireOrgPermissions } from "@/app/api/shared/permissions";

const actorNamesSchema = z.object({
  orgId: z.string().uuid(),
  ids: z.array(z.string().uuid()).min(1).max(200),
});

function formatDisplayName(firstName: string | null, lastName: string | null): string | null {
  const name = [firstName?.trim(), lastName?.trim()].filter(Boolean).join(" ").trim();
  return name || null;
}

export async function POST(req: NextRequest) {
  const csrfError = validateCsrfOrigin(req);
  if (csrfError) return csrfError;

  try {
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

    // Route this read through the shared guard as well as mutations. It
    // verifies membership and archive state and, crucially, redirects a
    // sandboxed caller to their owned Test Sandbox before service-role reads.
    const orgAuth = await requireOrgPermissions(req, parsed.data.orgId, () => true, {
      allowDuringSetup: true,
      allowLockedOrganization: true,
    });
    if ("response" in orgAuth) {
      return orgAuth.response;
    }

    const ids = Array.from(new Set(parsed.data.ids));
    const { orgId, serviceClient } = orgAuth;

    // profiles is a global (not per-org) table, so scope the lookup to ids
    // that are actually members of orgId first — otherwise any org member
    // could submit arbitrary UUIDs and resolve names of users in other orgs.
    const { data: memberships, error: membershipError } = await serviceClient
      .from("organization_memberships")
      .select("user_id")
      .eq("org_id", orgId)
      .in("user_id", ids)
      .is("archived_at", null);

    if (membershipError) {
      throw membershipError;
    }

    const orgMemberIds = (memberships ?? []).map((row) => row.user_id as string);

    const { data: profiles, error: profileError } =
      orgMemberIds.length > 0
        ? await serviceClient
            .from("profiles")
            .select("id, first_name, last_name")
            .in("id", orgMemberIds)
        : { data: [], error: null };

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
        .eq("org_id", orgId)
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
    logger.error({ error }, "schedule actor names POST failed");
    return NextResponse.json(
      { error: "We couldn't load who made each change. Refresh and try again." },
      { status: 500 },
    );
  }
}
