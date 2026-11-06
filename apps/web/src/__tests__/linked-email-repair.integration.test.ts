// @vitest-environment node

/**
 * Drives the daily email repair against the real auth server and database: a
 * confirmed sign-in change that the auth trigger (022) can't carry onto a
 * staff record, because another record holds the address, is reported once and
 * applied the day the address comes free.
 *
 * Skipped when the local Supabase stack is unreachable (CI without it).
 */

import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const dispatch = vi.fn(async () => ({ success: true }));
vi.mock("@/features/notifications/server", () => ({
  dispatchNotificationEvent: (...args: unknown[]) => dispatch(...(args as [])),
}));

import { repairLinkedEmails } from "@/features/employees/server/linked-email-repair";

const SUPABASE_URL = process.env.LOCAL_SUPABASE_URL ?? "http://127.0.0.1:54321";
// The Supabase CLI's fixed local demo service key; production keys never reach this file.
const LOCAL_DEMO_SERVICE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
const SERVICE_KEY = process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY ?? LOCAL_DEMO_SERVICE_KEY;
const DB_URL =
  process.env.LOCAL_SUPABASE_DB_URL ?? "postgres://postgres:postgres@127.0.0.1:54322/postgres";

async function probeStack(): Promise<boolean> {
  try {
    const health = await fetch(`${SUPABASE_URL}/auth/v1/health`);
    if (!health.ok) return false;
    const client = new Client({ connectionString: DB_URL });
    await client.connect();
    await client.end();
    return true;
  } catch {
    return false;
  }
}

const reachable = await probeStack();

describe.skipIf(!reachable)("the daily linked email repair", () => {
  const stamp = randomUUID().slice(0, 8);
  const oldEmail = `repair-old-${stamp}@dubgrid.test`;
  const newEmail = `repair-new-${stamp}@dubgrid.test`;
  const freedEmail = `repair-freed-${stamp}@dubgrid.test`;

  let service: SupabaseClient;
  let pg: Client;
  let userId: string;
  let orgId: string;
  let linkedId: string;
  let holderId: string;

  async function addEmployee(first: string, email: string, user: string | null): Promise<string> {
    const { rows } = await pg.query(
      `INSERT INTO public.employees
         (org_id, employee_number, first_name, last_name, seniority, user_id, email)
       VALUES ($1,
         (SELECT COALESCE(max(employee_number), 0) + 1 FROM public.employees WHERE org_id = $1),
         $2, 'Fixture', 9999, $3, $4)
       RETURNING id`,
      [orgId, first, user, email],
    );
    return rows[0].id as string;
  }

  async function employee(id: string): Promise<{ email: string; version: string }> {
    const { rows } = await pg.query(`SELECT email, version FROM public.employees WHERE id = $1`, [
      id,
    ]);
    return rows[0];
  }

  beforeAll(async () => {
    service = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    pg = new Client({ connectionString: DB_URL });
    await pg.connect();

    const { rows } = await pg.query(`SELECT id FROM public.organizations WHERE slug = 'calmhaven'`);
    orgId = rows[0].id as string;

    const { data, error } = await service.auth.admin.createUser({
      email: oldEmail,
      email_confirm: true,
    });
    if (error) throw error;
    userId = data.user.id;

    linkedId = await addEmployee("Linked", oldEmail, userId);
    holderId = await addEmployee("Holder", newEmail, null);
  });

  afterAll(async () => {
    if (!pg) return;
    await pg.query(`DELETE FROM public.employees WHERE id = ANY($1::uuid[])`, [
      [linkedId, holderId].filter(Boolean),
    ]);
    if (userId) await service.auth.admin.deleteUser(userId);
    await pg.end();
  });

  it("reports the clash once and applies the change when the address comes free", async () => {
    const { error } = await service.auth.admin.updateUserById(userId, {
      email: newEmail,
      email_confirm: true,
    });
    expect(error).toBeNull();
    expect((await employee(linkedId)).email).toBe(oldEmail);

    const first = await repairLinkedEmails(service);
    expect(first.blocked).toBeGreaterThanOrEqual(1);
    expect((await employee(linkedId)).email).toBe(oldEmail);
    expect((await employee(holderId)).email).toBe(newEmail);
    expect(dispatch).toHaveBeenCalledWith("linked-email-repair-cron", {
      action: "employee_email_blocked",
      orgId,
      empId: linkedId,
      signInEmail: newEmail,
      holderEmpId: holderId,
    });

    dispatch.mockClear();
    await repairLinkedEmails(service);
    expect(dispatch).not.toHaveBeenCalled();

    const before = await employee(linkedId);
    await pg.query(`UPDATE public.employees SET email = $1 WHERE id = $2`, [freedEmail, holderId]);
    await repairLinkedEmails(service);

    const after = await employee(linkedId);
    expect(after.email).toBe(newEmail);
    expect(Number(after.version)).toBe(Number(before.version) + 1);

    const { rows } = await pg.query(
      `SELECT action, details FROM public.audit_log
        WHERE resource_id = $1 ORDER BY created_at`,
      [linkedId],
    );
    expect(rows.map((row) => row.action)).toEqual([
      "employee.email_sync_blocked",
      "employee.email_synced",
    ]);
    expect(rows[1].details).toMatchObject({ previousEmail: oldEmail, email: newEmail });
  });
});
