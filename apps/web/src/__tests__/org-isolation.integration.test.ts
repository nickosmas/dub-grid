/**
 * Cross-tenant RLS isolation regression test.
 *
 * Anchors the invariant that a user signed into Org A can never read Org B's
 * data through the authenticated REST API, even when:
 *   - The user is a legitimate member of both orgs.
 *   - profiles.org_id still points at the wrong org (signup default that
 *     switch_org intentionally no longer mutates).
 *
 * This is the exact scenario that produced the original cross-tenant leak:
 * caller_org_id() used to read profiles.org_id, which drifted out of sync
 * with the JWT after switch_org stopped updating it. The fix made
 * caller_org_id() read auth.jwt() ->> 'org_id' instead.
 *
 * Skipped when LOCAL_SUPABASE_URL is unset (CI without a running Supabase).
 */

import { describe, expect, it } from "vitest";

const SUPABASE_URL = process.env.LOCAL_SUPABASE_URL ?? "http://127.0.0.1:54321";
const ANON_KEY =
  process.env.LOCAL_SUPABASE_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";

const TEST_EMAIL =
  process.env.LOCAL_SUPABASE_SUPER_ADMIN_EMAIL ?? "nicokosmas@outlook.com";
const TEST_PASSWORD =
  process.env.LOCAL_SUPABASE_SUPER_ADMIN_PASSWORD ?? "password123";

async function probeSupabase(): Promise<boolean> {
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/health`, {
      headers: { apikey: ANON_KEY },
    });
    return res.ok;
  } catch {
    return false;
  }
}

function decodeJwtClaims(token: string): Record<string, unknown> {
  const [, payload] = token.split(".");
  if (!payload) throw new Error("Malformed JWT");
  const padded = payload + "=".repeat((4 - (payload.length % 4)) % 4);
  return JSON.parse(
    Buffer.from(padded, "base64url").toString("utf8"),
  ) as Record<string, unknown>;
}

async function signIn(): Promise<{ accessToken: string; refreshToken: string }> {
  const res = await fetch(
    `${SUPABASE_URL}/auth/v1/token?grant_type=password`,
    {
      method: "POST",
      headers: { apikey: ANON_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
    },
  );
  if (!res.ok) throw new Error(`signIn failed: ${res.status}`);
  const data = (await res.json()) as {
    access_token: string;
    refresh_token: string;
  };
  return { accessToken: data.access_token, refreshToken: data.refresh_token };
}

async function rpc(
  accessToken: string,
  name: string,
  body: Record<string, unknown>,
): Promise<void> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`rpc ${name} failed: ${res.status} ${await res.text()}`);
  }
}

async function refreshSession(
  refreshToken: string,
): Promise<{ accessToken: string }> {
  const res = await fetch(
    `${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`,
    {
      method: "POST",
      headers: { apikey: ANON_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
    },
  );
  if (!res.ok) throw new Error(`refresh failed: ${res.status}`);
  const data = (await res.json()) as { access_token: string };
  return { accessToken: data.access_token };
}

async function listOrgIdsForUser(accessToken: string): Promise<string[]> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/organization_memberships?select=org_id&archived_at=is.null`,
    {
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${accessToken}` },
    },
  );
  if (!res.ok) {
    throw new Error(`memberships fetch failed: ${res.status}`);
  }
  const rows = (await res.json()) as Array<{ org_id: string }>;
  return rows.map((r) => r.org_id);
}

async function fetchEmployeesViaRls(
  accessToken: string,
): Promise<Array<{ org_id: string }>> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/employees?select=org_id`,
    {
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${accessToken}` },
    },
  );
  if (!res.ok) {
    throw new Error(`employees fetch failed: ${res.status}`);
  }
  return (await res.json()) as Array<{ org_id: string }>;
}

describe.runIf(await probeSupabase())(
  "cross-tenant RLS isolation",
  () => {
    it("RLS scopes authenticated reads to the JWT's org_id, even after switch_org leaves profiles.org_id stale", async () => {
      const { accessToken, refreshToken } = await signIn();
      const initialClaims = decodeJwtClaims(accessToken);
      const initialOrgId = initialClaims.org_id as string;
      expect(typeof initialOrgId).toBe("string");

      // Pick any OTHER org this user is a member of as the switch target.
      const orgIds = await listOrgIdsForUser(accessToken);
      const targetOrgId = orgIds.find((id) => id !== initialOrgId);
      if (!targetOrgId) {
        // Single-org user — nothing meaningful to test here.
        return;
      }

      // Session-scoped switch: queues a pending_org_switch row, consumed by
      // the next refresh. profiles.org_id is intentionally NOT mutated.
      await rpc(accessToken, "switch_org", { target_org_id: targetOrgId });

      const { accessToken: refreshed } = await refreshSession(refreshToken);
      const refreshedClaims = decodeJwtClaims(refreshed);
      expect(refreshedClaims.org_id).toBe(targetOrgId);

      // The acid test: query an RLS-gated table. Every row must belong to
      // the JWT's current org (targetOrgId). If caller_org_id() ever drifts
      // back to reading profiles.org_id, this assertion fails — which is
      // precisely the regression we're guarding against.
      const employees = await fetchEmployeesViaRls(refreshed);
      const distinctOrgIds = new Set(employees.map((e) => e.org_id));
      expect(distinctOrgIds.size).toBeLessThanOrEqual(1);
      if (distinctOrgIds.size === 1) {
        expect([...distinctOrgIds][0]).toBe(targetOrgId);
      }
    });
  },
);
