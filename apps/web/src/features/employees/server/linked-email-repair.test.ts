// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

const dispatch = vi.fn();
vi.mock("@/features/notifications/server", () => ({
  dispatchNotificationEvent: (...args: unknown[]) => dispatch(...args),
}));

import { repairLinkedEmails } from "./linked-email-repair";

const REAL = { workspace_kind: "real", archived_at: null };

interface Row {
  id: string;
  org_id: string;
  user_id: string;
  email: string;
  version: number;
  organization: { workspace_kind: string; archived_at: string | null };
}

function row(
  id: string,
  userId: string,
  email: string,
  organization: Row["organization"] = REAL,
): Row {
  return { id, org_id: "org-1", user_id: userId, email, version: 3, organization };
}

/** A fake holding the rows, the sign-ins and the clashes the unique index would raise. */
function fakeDb(input: {
  rows: Row[];
  signIns: Record<string, string>;
  holder?: string | null;
  priorReport?: boolean;
  usersPages?: Array<Array<{ id: string; email?: string }>>;
}) {
  const audit: Array<Record<string, unknown>> = [];
  const updates: Array<{ id: string; email: string; version: number }> = [];
  const pages = input.usersPages ?? [
    Object.entries(input.signIns).map(([id, email]) => ({ id, email })),
  ];

  const emailInUse = (email: string, exceptId: string) =>
    input.rows.some(
      (candidate) =>
        candidate.id !== exceptId && candidate.email.toLowerCase() === email.toLowerCase(),
    );

  const employees = () => {
    const filters: Record<string, unknown> = {};
    let patch: { email: string; version: number } | null = null;
    const chain = {
      select: () => chain,
      not: () => chain,
      is: () => chain,
      neq: () => chain,
      ilike: () => chain,
      limit: () => chain,
      order: () => chain,
      range: async () => ({ data: input.rows, error: null }),
      update: (values: { email: string; version: number }) => {
        patch = values;
        return chain;
      },
      eq: (column: string, value: unknown) => {
        filters[column] = value;
        return chain;
      },
      maybeSingle: async () => {
        if (!patch) {
          return { data: input.holder ? { id: input.holder } : null, error: null };
        }
        const target = input.rows.find((candidate) => candidate.id === filters.id);
        if (!target || target.version !== filters.version) return { data: null, error: null };
        if (emailInUse(patch.email, target.id)) {
          return { data: null, error: { code: "23505", message: "duplicate" } };
        }
        target.email = patch.email;
        target.version = patch.version;
        updates.push({ id: target.id, ...patch });
        return { data: { id: target.id }, error: null };
      },
    };
    return chain;
  };

  const auditLog = () => {
    const chain = {
      select: () => chain,
      eq: () => chain,
      limit: async () => ({ data: input.priorReport ? [{ id: 1 }] : [], error: null }),
      insert: async (values: Record<string, unknown>) => {
        audit.push(values);
        return { error: null };
      },
    };
    return chain;
  };

  const db = {
    from: (table: string) => (table === "audit_log" ? auditLog() : employees()),
    auth: {
      admin: {
        listUsers: async ({ page }: { page: number }) => ({
          data: { users: pages[page - 1] ?? [] },
          error: null,
        }),
      },
    },
  } as unknown as SupabaseClient;

  return { db, audit, updates };
}

describe("repairLinkedEmails", () => {
  beforeEach(() => {
    dispatch.mockReset();
    dispatch.mockResolvedValue({ success: true });
  });

  it("moves a record that fell behind its sign-in, and logs it", async () => {
    const { db, audit, updates } = fakeDb({
      rows: [row("e1", "u1", "old@example.com")],
      signIns: { u1: "new@example.com" },
    });

    await expect(repairLinkedEmails(db)).resolves.toEqual({ repaired: 1, blocked: 0 });

    expect(updates).toEqual([{ id: "e1", email: "new@example.com", version: 4 }]);
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      action: "employee.email_synced",
      resource_id: "e1",
      details: { previousEmail: "old@example.com", email: "new@example.com" },
    });
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("leaves a record alone when only case or spacing differs", async () => {
    const { db, updates } = fakeDb({
      rows: [row("e1", "u1", " Same@Example.com ")],
      signIns: { u1: "same@example.com" },
    });

    await expect(repairLinkedEmails(db)).resolves.toEqual({ repaired: 0, blocked: 0 });
    expect(updates).toEqual([]);
  });

  it("ignores test sandboxes and closed organizations", async () => {
    const { db, updates } = fakeDb({
      rows: [
        row("e1", "u1", "old@example.com", { workspace_kind: "sandbox", archived_at: null }),
        row("e2", "u1", "old@example.com", {
          workspace_kind: "real",
          archived_at: "2026-10-01T00:00:00Z",
        }),
      ],
      signIns: { u1: "new@example.com" },
    });

    await expect(repairLinkedEmails(db)).resolves.toEqual({ repaired: 0, blocked: 0 });
    expect(updates).toEqual([]);
  });

  it("alerts the Super Admins about a clash, logs it, and leaves both records", async () => {
    const holder = row("e2", "u2", "new@example.com");
    const { db, audit, updates } = fakeDb({
      rows: [row("e1", "u1", "old@example.com"), holder],
      signIns: { u1: "new@example.com", u2: "new@example.com" },
      holder: "e2",
    });

    await expect(repairLinkedEmails(db)).resolves.toEqual({ repaired: 0, blocked: 1 });

    expect(updates).toEqual([]);
    expect(holder.email).toBe("new@example.com");
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith("linked-email-repair-cron", {
      action: "employee_email_blocked",
      orgId: "org-1",
      empId: "e1",
      signInEmail: "new@example.com",
      holderEmpId: "e2",
    });
    expect(audit).toEqual([
      expect.objectContaining({
        action: "employee.email_sync_blocked",
        details: { email: "new@example.com", holderEmpId: "e2" },
      }),
    ]);
  });

  it("does not alert again about a clash it already reported", async () => {
    const { db, audit } = fakeDb({
      rows: [row("e1", "u1", "old@example.com"), row("e2", "u2", "new@example.com")],
      signIns: { u1: "new@example.com", u2: "new@example.com" },
      priorReport: true,
    });

    await expect(repairLinkedEmails(db)).resolves.toEqual({ repaired: 0, blocked: 1 });
    expect(dispatch).not.toHaveBeenCalled();
    expect(audit).toEqual([]);
  });

  it("tries again tomorrow when the alert could not be sent", async () => {
    dispatch.mockResolvedValue({ success: false, error: "down" });
    const { db, audit } = fakeDb({
      rows: [row("e1", "u1", "old@example.com"), row("e2", "u2", "new@example.com")],
      signIns: { u1: "new@example.com", u2: "new@example.com" },
    });

    await repairLinkedEmails(db);
    expect(audit).toEqual([]);
  });

  it("raises no alert when the address was freed by another move in the same run", async () => {
    const { db, updates } = fakeDb({
      rows: [row("e1", "u1", "old@example.com"), row("e2", "u2", "new@example.com")],
      signIns: { u1: "new@example.com", u2: "newer@example.com" },
    });

    await expect(repairLinkedEmails(db)).resolves.toEqual({ repaired: 2, blocked: 0 });
    expect(updates.map((update) => update.id)).toEqual(["e2", "e1"]);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("reads every page of sign-ins", async () => {
    const fullPage = Array.from({ length: 1000 }, (_, index) => ({
      id: `filler-${index}`,
      email: `filler-${index}@example.com`,
    }));
    const { db, updates } = fakeDb({
      rows: [row("e1", "u1", "old@example.com")],
      signIns: {},
      usersPages: [fullPage, [{ id: "u1", email: "new@example.com" }]],
    });

    await repairLinkedEmails(db);
    expect(updates).toHaveLength(1);
  });

  it("skips an account with no email", async () => {
    const { db, updates } = fakeDb({
      rows: [row("e1", "u1", "old@example.com")],
      signIns: {},
      usersPages: [[{ id: "u1" }]],
    });

    await expect(repairLinkedEmails(db)).resolves.toEqual({ repaired: 0, blocked: 0 });
    expect(updates).toEqual([]);
  });
});
