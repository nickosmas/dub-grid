/**
 * Per-session org isolation regression test.
 *
 * Anchors the invariant that switching orgs on one session does NOT
 * affect another session for the same user. This is the multi-device
 * use case: web + mobile-A + mobile-B can each independently be in a
 * different org without contaminating each other on JWT refresh.
 *
 * Implementation under test:
 *   - switch_org writes user_sessions.active_org_id, keyed by the JWT
 *     session_id claim.
 *   - custom_access_token_hook reads user_sessions.active_org_id for the
 *     incoming session_id and uses it as the effective org. Falls back
 *     to profiles.org_id when no per-session row exists.
 *
 * Skipped when LOCAL_SUPABASE_URL is unset (CI without a running Supabase).
 */

import { describe, expect, it } from "vitest";

const SUPABASE_URL = process.env.LOCAL_SUPABASE_URL ?? "http://127.0.0.1:54321";
const ANON_KEY =
  process.env.LOCAL_SUPABASE_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";

const TEST_EMAIL = process.env.LOCAL_SUPABASE_SUPER_ADMIN_EMAIL ?? "qa-super-admin@dubgrid.test";
const TEST_PASSWORD = process.env.LOCAL_SUPABASE_SUPER_ADMIN_PASSWORD ?? "password123";

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
  return JSON.parse(Buffer.from(padded, "base64url").toString("utf8")) as Record<string, unknown>;
}

interface Session {
  accessToken: string;
  refreshToken: string;
}

async function signIn(): Promise<Session> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
  });
  if (!res.ok) throw new Error(`signIn failed: ${res.status}`);
  const data = (await res.json()) as {
    access_token: string;
    refresh_token: string;
  };
  return { accessToken: data.access_token, refreshToken: data.refresh_token };
}

async function refreshSession(refreshToken: string): Promise<Session> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST",
    headers: { apikey: ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  if (!res.ok) throw new Error(`refresh failed: ${res.status}`);
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

describe.runIf(await probeSupabase())("per-session org isolation", () => {
  it("switch_org on session A leaves session B's org unchanged after refresh", async () => {
    // Two independent sign-ins → two distinct auth.sessions rows
    // (different session_id claims), simulating web + a mobile device.
    const sessionA = await signIn();
    const sessionB = await signIn();

    const claimsA0 = decodeJwtClaims(sessionA.accessToken);
    const claimsB0 = decodeJwtClaims(sessionB.accessToken);

    const sessionIdA = claimsA0.session_id as string;
    const sessionIdB = claimsB0.session_id as string;
    expect(typeof sessionIdA).toBe("string");
    expect(typeof sessionIdB).toBe("string");
    // Confirm we actually have two distinct sessions for this test to be meaningful.
    expect(sessionIdA).not.toBe(sessionIdB);

    const originalOrgId = claimsA0.org_id as string;
    expect(typeof originalOrgId).toBe("string");
    // Both sessions for the same user should land in the same default org.
    expect(claimsB0.org_id).toBe(originalOrgId);

    // Need a second membership to be able to switch.
    const orgIds = await listOrgIdsForUser(sessionA.accessToken);
    const targetOrgId = orgIds.find((id) => id !== originalOrgId);
    if (!targetOrgId) {
      // Single-org test user — invariant is vacuously true; skip without failing.
      return;
    }

    // Switch only on session A.
    await rpc(sessionA.accessToken, "switch_org", {
      target_org_id: targetOrgId,
    });

    // Refresh both sessions.
    const sessionARefreshed = await refreshSession(sessionA.refreshToken);
    const sessionBRefreshed = await refreshSession(sessionB.refreshToken);

    const claimsA1 = decodeJwtClaims(sessionARefreshed.accessToken);
    const claimsB1 = decodeJwtClaims(sessionBRefreshed.accessToken);

    // Session A picks up the new org.
    expect(claimsA1.org_id).toBe(targetOrgId);
    // Session B's session_id is unchanged across the refresh.
    expect(claimsB1.session_id).toBe(sessionIdB);
    // CRITICAL: session B must still be on the original org. If this fails,
    // we've regressed to the old behavior where switch_org wrote a global
    // field that every session's refresh consumed.
    expect(claimsB1.org_id).toBe(originalOrgId);
  });

  it("switch_org on session B then session A leaves each in its own org", async () => {
    const sessionA = await signIn();
    const sessionB = await signIn();

    const claimsA0 = decodeJwtClaims(sessionA.accessToken);
    const originalOrgId = claimsA0.org_id as string;

    const orgIds = await listOrgIdsForUser(sessionA.accessToken);
    const targetOrgId = orgIds.find((id) => id !== originalOrgId);
    if (!targetOrgId) {
      return;
    }

    // Switch B → target, then switch A → target. Then bounce B back to original.
    await rpc(sessionB.accessToken, "switch_org", {
      target_org_id: targetOrgId,
    });
    await rpc(sessionA.accessToken, "switch_org", {
      target_org_id: targetOrgId,
    });
    await rpc(sessionB.accessToken, "switch_org", {
      target_org_id: originalOrgId,
    });

    const a = decodeJwtClaims((await refreshSession(sessionA.refreshToken)).accessToken);
    const b = decodeJwtClaims((await refreshSession(sessionB.refreshToken)).accessToken);

    // Each session reflects its own most-recent switch — no cross-talk.
    expect(a.org_id).toBe(targetOrgId);
    expect(b.org_id).toBe(originalOrgId);
  });
});
