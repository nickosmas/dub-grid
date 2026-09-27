import { describe, expect, it } from "vitest";
import { describeAuditAction } from "@/lib/audit/registry";
import { HISTORY_SOURCE_CAP, loadAccountHistoryRows } from "./person-history";

const USER = "11111111-1111-4111-8111-111111111111";
const GM = "22222222-2222-4222-8222-222222222222";

type Calls = Record<string, Array<[string, ...unknown[]]>>;

function makeClient(tables: Record<string, unknown[]>) {
  const calls: Calls = {};
  const client = {
    from: (table: string) => {
      const recorded = (calls[table] ??= []);
      const chain: Record<string, unknown> = {};
      for (const op of ["select", "eq", "or", "order"]) {
        chain[op] = (...args: unknown[]) => {
          recorded.push([op, ...args]);
          return chain;
        };
      }
      chain.limit = (count: number) => {
        recorded.push(["limit", count]);
        return Promise.resolve({ data: tables[table] ?? [], error: null });
      };
      return chain;
    },
  };
  return { client, calls };
}

describe("loadAccountHistoryRows", () => {
  it("reads what the person did and what was done to their account, in any organization", async () => {
    const { client, calls } = makeClient({
      audit_log: [
        { id: 1, action: "security.auth.login", actor_id: USER, org_id: "org-1" },
        { id: 2, action: "account.terminated", actor_id: GM, org_id: null },
      ],
    });

    const { rows } = await loadAccountHistoryRows(client as never, USER);

    expect(rows.map((row) => row.id)).toEqual([1, 2]);
    expect(calls.audit_log).toContainEqual([
      "or",
      `actor_id.eq.${USER},and(resource_type.eq.user,resource_id.eq.${USER}),details->>targetUserId.eq.${USER}`,
    ]);
    expect(calls.audit_log.some(([op, column]) => op === "eq" && column === "org_id")).toBe(false);
  });

  it("never reads IP addresses or user agents", async () => {
    const { client, calls } = makeClient({});
    await loadAccountHistoryRows(client as never, USER);

    for (const table of ["audit_log", "impersonation_sessions"]) {
      const select = calls[table].find(([op]) => op === "select")?.[1] as string;
      expect(select).not.toMatch(/ip_address|user_agent/);
      expect(select).not.toContain("*");
    }
  });

  it("turns each impersonation of them into one row with its length and ending", async () => {
    const { client, calls } = makeClient({
      audit_log: [
        { id: 3, action: "impersonation.started", actor_id: GM, org_id: "org-1" },
        { id: 4, action: "impersonation.ended", actor_id: GM, org_id: "org-1" },
      ],
      impersonation_sessions: [
        {
          session_id: "s-1",
          gridmaster_id: GM,
          target_user_id: USER,
          target_org_id: "org-1",
          justification: "Ticket 42",
          expires_at: "2026-09-27T11:00:00.000Z",
          created_at: "2026-09-27T10:00:00.000Z",
          ended_at: "2026-09-27T10:12:00.000Z",
          end_reason: "manual",
        },
        {
          session_id: "s-2",
          gridmaster_id: GM,
          target_user_id: USER,
          target_org_id: "org-1",
          justification: null,
          expires_at: "2026-09-28T11:00:00.000Z",
          created_at: "2026-09-28T10:00:00.000Z",
          ended_at: null,
          end_reason: null,
        },
      ],
    });

    const { rows } = await loadAccountHistoryRows(client as never, USER);

    // The session rows replace the started and ended rows about them.
    expect(rows.map((row) => row.id)).toEqual(["impersonation-s-1", "impersonation-s-2"]);
    expect(rows[0]).toMatchObject({
      action: "impersonation.session",
      actor_id: GM,
      org_id: "org-1",
      resource_id: USER,
      created_at: "2026-09-27T10:00:00.000Z",
      details: { justification: "Ticket 42", durationMinutes: 12, endReason: "manual" },
    });
    expect(rows[1]).toMatchObject({ details: { durationMinutes: null, endedAt: null } });
    expect(calls.impersonation_sessions).toContainEqual(["eq", "target_user_id", USER]);
  });

  it("keeps impersonations the person started themselves", async () => {
    const { client } = makeClient({
      audit_log: [{ id: 5, action: "impersonation.started", actor_id: USER, org_id: "org-1" }],
    });

    const { rows } = await loadAccountHistoryRows(client as never, USER);

    expect(rows.map((row) => row.id)).toEqual([5]);
  });

  it("records editor sessions another editor ended", async () => {
    const { client, calls } = makeClient({
      schedule_editor_session_terminations: [
        { id: "t-1", org_id: "org-1", user_id: USER, ended_at: "2026-09-26T09:00:00.000Z" },
      ],
    });

    const { rows } = await loadAccountHistoryRows(client as never, USER);

    expect(rows).toEqual([
      expect.objectContaining({
        id: "editor-end-t-1",
        action: "schedule.editor_session_ended",
        org_id: "org-1",
        created_at: "2026-09-26T09:00:00.000Z",
      }),
    ]);
    expect(calls.schedule_editor_session_terminations).toContainEqual(["eq", "user_id", USER]);
  });

  it("caps each source and says when one was full", async () => {
    const full = Array.from({ length: HISTORY_SOURCE_CAP }, (_, index) => ({
      id: index,
      action: "security.auth.login",
      actor_id: USER,
    }));

    expect((await loadAccountHistoryRows(makeClient({}).client as never, USER)).truncated).toBe(
      false,
    );
    const { client, calls } = makeClient({ audit_log: full });
    expect((await loadAccountHistoryRows(client as never, USER)).truncated).toBe(true);
    expect(calls.audit_log).toContainEqual(["limit", HISTORY_SOURCE_CAP]);
    expect(HISTORY_SOURCE_CAP).toBe(500);
  });
});

describe("history headlines", () => {
  it("says how long an impersonation lasted and why", () => {
    expect(
      describeAuditAction(
        "impersonation.session",
        { durationMinutes: 12, justification: "Ticket 42" },
        { targetLabel: "Ada Lovelace" },
      ),
    ).toBe("Viewed the app as Ada Lovelace for 12 minutes: Ticket 42");
    expect(describeAuditAction("impersonation.session", { durationMinutes: 1 })).toBe(
      "Viewed the app as this person for 1 minute",
    );
    expect(describeAuditAction("impersonation.session", {})).toBe(
      "Viewed the app as this person (still going)",
    );
  });

  it("names an editor session another editor ended", () => {
    expect(
      describeAuditAction("schedule.editor_session_ended", {}, { targetLabel: "Ada Lovelace" }),
    ).toBe("Another editor ended Ada Lovelace's schedule editing session");
  });
});
