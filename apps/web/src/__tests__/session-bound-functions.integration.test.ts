// @vitest-environment node

/**
 * Migrations 126 and 127 (F-194, F-195, F-198, F-212, F-213, F-224): a caller acts
 * through the database only in the organization their session is signed in to, or
 * in a Test Sandbox they could still enter, and being refused one organization
 * doesn't cost them their others. Each case runs in a transaction that is rolled
 * back.
 *
 * Skipped when the local Postgres is unreachable or behind migration 127.
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Client } from "pg";
import { actAsAuthenticated } from "./helpers/simulated-jwt";

const DB_URL =
  process.env.LOCAL_SUPABASE_DB_URL ?? "postgres://postgres:postgres@127.0.0.1:54322/postgres";
const DB_CONFIG = {
  connectionString: DB_URL,
  ssl: DB_URL.includes("supabase.co") ? { rejectUnauthorized: false } : false,
} as const;
const SESSION_ID = "12601260-1260-4126-8126-126012601260";
const FAR_DATE = "2031-03-03";

async function probeDb(): Promise<boolean> {
  const probe = new Client(DB_CONFIG);
  try {
    await probe.connect();
    const { rows } = await probe.query<{ present: boolean }>(
      `SELECT to_regproc('public.sign_in_org_instead_of_default') IS NOT NULL AS present`,
    );
    return rows[0]?.present === true;
  } catch {
    return false;
  } finally {
    await probe.end().catch(() => undefined);
  }
}

const reachable = await probeDb();
let db: Client;
// A Super Admin with a staff record in both organizations.
let orgA: string;
let orgB: string;
let userId: string;
let empA: string;
let empB: string;
let teammate: string;

async function one<T>(sql: string, params: unknown[] = []): Promise<T> {
  const { rows } = await db.query(sql, params);
  if (rows.length === 0) throw new Error(`No row for: ${sql}`);
  return Object.values(rows[0] as Record<string, T>)[0]!;
}

async function refusal(sql: string, params: unknown[] = []): Promise<string | null> {
  await db.query("SAVEPOINT attempt");
  try {
    await db.query(sql, params);
    return null;
  } catch (error) {
    return (error as Error).message;
  } finally {
    await db.query("ROLLBACK TO SAVEPOINT attempt");
  }
}

const signedInTo = (orgId: string | null, claims: Record<string, unknown> = {}) =>
  actAsAuthenticated(db, { sub: userId, role: "authenticated", org_id: orgId, ...claims });

const pendingRequest = (orgId: string, requester: string) =>
  one<string>(
    `INSERT INTO public.shift_requests
       (org_id, type, requester_emp_id, requester_shift_date, requester_state, status, expires_at)
     VALUES ($1, 'pickup', $2, $3, '{}'::JSONB, 'pending_approval', now() + interval '1 day')
     RETURNING id`,
    [orgId, requester, FAR_DATE],
  );

const publish = (orgId: string) =>
  refusal(`SELECT public.publish_schedule($1, $2::DATE, $2::DATE)`, [orgId, FAR_DATE]);

const changeRole = (orgId: string | null) =>
  refusal(`SELECT public.change_user_role($1, 'admin', $2, gen_random_uuid()::TEXT, $3::UUID)`, [
    teammate,
    userId,
    orgId,
  ]);

const createRequest = (orgId: string, employee: string) =>
  refusal(`SELECT public.create_shift_request($1, 'calloff', $2, $3::DATE)`, [
    orgId,
    employee,
    FAR_DATE,
  ]);

const volunteer = (orgId: string, employee: string) =>
  refusal(
    `SELECT public.volunteer_for_open_shift($1, $2, $3::DATE, ARRAY[]::BIGINT[], ARRAY[]::BIGINT[], NULL)`,
    [orgId, employee, FAR_DATE],
  );

describe.skipIf(!reachable)("callers act in their session's organization", () => {
  beforeAll(async () => {
    db = new Client(DB_CONFIG);
    await db.connect();
    const { rows } = await db.query<{
      org_a: string;
      org_b: string;
      user_id: string;
      emp_a: string;
      emp_b: string;
    }>(
      `SELECT a.org_id AS org_a, b.org_id AS org_b, a.user_id, a.id AS emp_a, b.id AS emp_b
         FROM public.employees a
         JOIN public.employees b ON b.user_id = a.user_id AND b.org_id <> a.org_id
         JOIN public.organizations oa ON oa.id = a.org_id AND oa.workspace_kind = 'real'
         JOIN public.organizations ob ON ob.id = b.org_id AND ob.workspace_kind = 'real'
         JOIN public.profiles p ON p.id = a.user_id AND p.platform_role <> 'gridmaster'
         JOIN public.organization_memberships ma
           ON ma.org_id = a.org_id AND ma.user_id = a.user_id
          AND ma.org_role = 'super_admin' AND ma.archived_at IS NULL
         JOIN public.organization_memberships mb
           ON mb.org_id = b.org_id AND mb.user_id = b.user_id
          AND mb.org_role = 'super_admin' AND mb.archived_at IS NULL
        WHERE a.suspended_at IS NULL AND b.suspended_at IS NULL
          AND oa.archived_at IS NULL AND ob.archived_at IS NULL
        ORDER BY a.org_id, b.org_id, a.user_id
        LIMIT 1`,
    );
    if (!rows[0]) throw new Error("Local fixtures missing; run npm run db:reset");
    ({ org_a: orgA, org_b: orgB, user_id: userId, emp_a: empA, emp_b: empB } = rows[0]);
    teammate = await one<string>(
      `SELECT user_id FROM public.organization_memberships
        WHERE org_id = $1 AND org_role = 'user' AND archived_at IS NULL
        ORDER BY user_id LIMIT 1`,
      [orgA],
    );
  });

  afterAll(async () => {
    await db.end();
  });

  beforeEach(async () => {
    await db.query("BEGIN");
  });

  afterEach(async () => {
    await db.query("ROLLBACK");
  });

  it("publishes only in the session's organization (F-194)", async () => {
    await signedInTo(orgA);

    expect(await publish(orgB)).toMatch(/sign in to this organization/);
    expect(await publish(orgA)).toBeNull();
  });

  it("changes a role only in the session's organization (F-194)", async () => {
    await signedInTo(orgA);

    expect(await changeRole(orgB)).toMatch(/sign in to this organization/);
    expect(await changeRole(orgA)).toBeNull();
  });

  it("stops a token issued before a suspension (F-194)", async () => {
    await db.query(`UPDATE public.employees SET suspended_at = now() WHERE id = $1`, [empB]);
    await signedInTo(orgB);

    expect(await one<string | null>(`SELECT public.caller_org_id()`)).toBeNull();
    expect(await publish(orgB)).toMatch(/sign in to this organization/);
    expect(await changeRole(orgB)).toMatch(/sign in to this organization/);
  });

  it("files a request or volunteers only in the session's organization (F-213)", async () => {
    await signedInTo(orgA);

    expect(await createRequest(orgB, empB)).toMatch(/sign in to this organization/);
    expect(await volunteer(orgB, empB)).toMatch(/sign in to this organization/);
  });

  it("writes job overrides and starts a trial only in the session's organization (F-194)", async () => {
    const job = await one<number>(`SELECT id FROM public.jobs WHERE org_id = $1 LIMIT 1`, [orgB]);
    await signedInTo(orgA);

    expect(await refusal(`SELECT public.set_job_shift_overrides($1)`, [job])).toMatch(
      /sign in to this organization/,
    );
    expect(await refusal(`SELECT public.start_trial_for_org($1)`, [orgB])).toMatch(
      /sign in to this organization/,
    );
  });

  describe("being refused one organization (F-224)", () => {
    const SESSION = "12701270-1270-4127-8127-127012701270";
    const SUSPENDED = /Your access has been suspended/;

    const mint = async (sessionId: string | null = SESSION) => {
      const { rows } = await db.query<{
        result: { error?: { message: string }; claims?: { org_id?: string } };
      }>(`SELECT public.custom_access_token_hook($1::JSONB) AS result`, [
        JSON.stringify({
          user_id: userId,
          claims: {
            sub: userId,
            aal: "aal1",
            role: "authenticated",
            ...(sessionId ? { session_id: sessionId } : {}),
          },
          authentication_method: "password",
        }),
      ]);
      return rows[0]!.result;
    };

    const defaultOrg = () =>
      one<string>(`SELECT org_id FROM public.profiles WHERE id = $1`, [userId]);

    beforeEach(async () => {
      await db.query(`DELETE FROM public.jwt_refresh_locks WHERE user_id = $1`, [userId]);
      await db.query(`UPDATE public.profiles SET org_id = $2 WHERE id = $1`, [userId, orgA]);
    });

    it("starts a new session in another organization, and keeps the default", async () => {
      await db.query(`UPDATE public.employees SET suspended_at = now() WHERE id = $1`, [empA]);

      const { claims, error } = await mint();

      expect(error).toBeUndefined();
      expect(claims?.org_id).toBeTruthy();
      expect(claims?.org_id).not.toBe(orgA);
      expect(await defaultOrg()).toBe(orgA);
    });

    it("does the same for someone offboarded from their default", async () => {
      await db.query(
        `UPDATE public.organization_memberships SET archived_at = now()
          WHERE user_id = $1 AND org_id = $2`,
        [userId, orgA],
      );
      await db.query(`UPDATE public.employees SET status = 'removed' WHERE id = $1`, [empA]);
      // Archiving a membership holds the person's tokens for a moment.
      await db.query(`DELETE FROM public.jwt_refresh_locks WHERE user_id = $1`, [userId]);

      const { claims, error } = await mint();

      expect(error).toBeUndefined();
      expect(claims?.org_id).not.toBe(orgA);
    });

    it("still refuses someone with nowhere else to go", async () => {
      await db.query(`UPDATE public.employees SET suspended_at = now() WHERE id = $1`, [empA]);
      await db.query(
        `UPDATE public.organization_memberships SET archived_at = now()
          WHERE user_id = $1 AND org_id <> $2`,
        [userId, orgA],
      );

      expect((await mint()).error?.message).toMatch(SUSPENDED);
    });

    it("still refuses a session already in that organization", async () => {
      await mint();
      await db.query(`UPDATE public.employees SET suspended_at = now() WHERE id = $1`, [empA]);

      expect((await mint()).error?.message).toMatch(SUSPENDED);
    });

    it("refuses a switch into it before writing anything", async () => {
      await db.query(
        `UPDATE public.employees SET suspended_at = now(), suspended_until = '2031-12-01'
          WHERE id = $1`,
        [empB],
      );
      await signedInTo(orgA);

      const refused = await refusal(`SELECT public.switch_org($1)`, [orgB]);
      await db.query("RESET ROLE");

      expect(refused).toMatch(SUSPENDED);
      expect(refused).toMatch(/Until 2031-12-01\./);
      expect(await defaultOrg()).toBe(orgA);
    });

    it("still lets them switch between the rest", async () => {
      await signedInTo(orgA);

      expect(await refusal(`SELECT public.switch_org($1)`, [orgB])).toBeNull();
    });
  });

  describe("settling a request (F-212)", () => {
    let request: string;

    beforeEach(async () => {
      request = await pendingRequest(orgA, empA);
    });

    const settle = () => refusal(`SELECT public.resolve_shift_request($1, FALSE)`, [request]);
    const autoApprove = () => refusal(`SELECT public.auto_approve_shift_request($1)`, [request]);
    const status = async () => {
      await db.query("RESET ROLE");
      return one<string>(`SELECT status FROM public.shift_requests WHERE id = $1`, [request]);
    };

    it("refuses a second factor still to answer", async () => {
      await signedInTo(orgA, { mfa_enrolled: true, aal: "aal1" });

      expect(await settle()).toMatch(/Request not found/);
      expect(await autoApprove()).not.toBeNull();
      expect(await status()).toBe("pending_approval");
    });

    it("refuses a token with no organization, or another organization", async () => {
      await signedInTo(null);
      expect(await settle()).toMatch(/Request not found/);

      await signedInTo(orgB);
      expect(await settle()).toMatch(/Request not found/);
      expect(await status()).toBe("pending_approval");
    });

    it("hides what a draft would change from another organization's session", async () => {
      await signedInTo(orgB);

      expect(
        await refusal(`SELECT * FROM public.shift_request_draft_cells($1)`, [request]),
      ).toMatch(/Request not found/);
    });

    it("lets an approver settle it in their own session", async () => {
      await signedInTo(orgA);

      await db.query(`SELECT public.resolve_shift_request($1, FALSE)`, [request]);

      expect(await status()).not.toBe("pending_approval");
    });
  });

  describe("a Test Sandbox", () => {
    let sandbox: string;

    beforeEach(async () => {
      sandbox = await one<string>(
        `INSERT INTO public.organizations
           (name, slug, workspace_kind, sandbox_owner_user_id, sandbox_owner_session_id, sandbox_source_org_id)
         VALUES ('Sandbox', 'sandbox-session-bound', 'sandbox', $1, $2, $3)
         RETURNING id`,
        [userId, SESSION_ID, orgA],
      );
    });

    const ownsIt = async () => {
      await signedInTo(orgA, { session_id: SESSION_ID });
      const owned = await one<boolean>(`SELECT public.is_own_sandbox_org($1)`, [sandbox]);
      await db.query("RESET ROLE");
      return owned;
    };

    it("stays open to an owner who could still enter it", async () => {
      expect(await ownsIt()).toBe(true);
    });

    it("lets its owner act on its requests (F-195)", async () => {
      const clone = await one<string>(
        `INSERT INTO public.employees
           (org_id, user_id, employee_number, first_name, last_name, status, seniority)
         VALUES ($1, $2, 1, 'Sandbox', 'Owner', 'active', 1) RETURNING id`,
        [sandbox, userId],
      );
      const request = await pendingRequest(sandbox, clone);
      await signedInTo(orgA, { session_id: SESSION_ID });

      expect(await refusal(`SELECT public.cancel_shift_request($1, $2)`, [request, clone])).toBe(
        null,
      );
    });

    it("closes once they're suspended in the source organization (F-198)", async () => {
      await db.query(`UPDATE public.employees SET suspended_at = now() WHERE id = $1`, [empA]);

      expect(await ownsIt()).toBe(false);
    });

    it("closes once their access to the source organization ends (F-198)", async () => {
      await db.query(
        `UPDATE public.organization_memberships SET archived_at = now()
          WHERE user_id = $1 AND org_id = $2`,
        [userId, orgA],
      );

      expect(await ownsIt()).toBe(false);
    });

    it("closes for an Admin who can no longer manage staff (F-198)", async () => {
      await db.query(`ALTER TABLE public.organization_memberships DISABLE TRIGGER USER`);
      await db.query(
        `UPDATE public.organization_memberships
            SET org_role = 'admin', admin_permissions = '{"canEditShifts": true}'::JSONB
          WHERE user_id = $1 AND org_id = $2`,
        [userId, orgA],
      );
      await db.query(`ALTER TABLE public.organization_memberships ENABLE TRIGGER USER`);

      expect(await ownsIt()).toBe(false);
    });
  });
});
