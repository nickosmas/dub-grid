import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireOrgPermissions = vi.fn();
const maybeSingle = vi.fn();
const upsert = vi.fn();
const eqEditorSession = vi.fn(() => ({ maybeSingle }));
const eqUser = vi.fn(() => ({ eq: eqEditorSession }));
const eqOrg = vi.fn(() => ({ eq: eqUser }));
const select = vi.fn(() => ({ eq: eqOrg }));
const from = vi.fn(() => ({ select, upsert }));

vi.mock("@/app/api/shared/permissions", () => ({
  requireOrgPermissions: (...args: unknown[]) => requireOrgPermissions(...args),
}));
vi.mock("@/lib/csrf", () => ({ validateCsrfOrigin: () => null }));
vi.mock("@/lib/logger", () => ({ default: { error: vi.fn(), warn: vi.fn() } }));

import { GET, POST } from "./route";

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const TARGET_ID = "22222222-2222-4222-8222-222222222222";
const ENDING_ID = "33333333-3333-4333-8333-333333333333";
const SECOND_TARGET_ID = "44444444-4444-4444-8444-444444444444";

function post(body: unknown) {
  return POST(
    new NextRequest("http://localhost/api/schedule/editor-sessions", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  );
}

describe("/api/schedule/editor-sessions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireOrgPermissions.mockResolvedValue({
      actor: { id: "user-1" },
      orgId: ORG_ID,
      serviceClient: { from },
    });
    maybeSingle.mockResolvedValue({ data: null, error: null });
    upsert.mockResolvedValue({ error: null });
  });

  it("stores an opaque target session under the authenticated user before responding", async () => {
    const response = await post({
      orgId: ORG_ID,
      targetEditorSessionIds: [TARGET_ID, SECOND_TARGET_ID],
      endingEditorSessionId: ENDING_ID,
      userId: "user-2",
    });

    expect(response.status).toBe(200);
    expect(from).toHaveBeenCalledWith("schedule_editor_session_terminations");
    expect(upsert).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          org_id: ORG_ID,
          user_id: "user-1",
          editor_session_id: TARGET_ID,
          ended_by_editor_session_id: ENDING_ID,
        }),
        expect.objectContaining({
          org_id: ORG_ID,
          user_id: "user-1",
          editor_session_id: SECOND_TARGET_ID,
          ended_by_editor_session_id: ENDING_ID,
        }),
      ],
      { onConflict: "org_id,user_id,editor_session_id" },
    );
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        endedEditorSessionIds: [TARGET_ID, SECOND_TARGET_ID],
      }),
    );
  });

  it("cannot end the caller's own current editor session", async () => {
    const response = await post({
      orgId: ORG_ID,
      targetEditorSessionIds: [TARGET_ID],
      endingEditorSessionId: TARGET_ID,
    });

    expect(response.status).toBe(400);
    expect(requireOrgPermissions).not.toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();
  });

  it("rejects duplicate or unbounded target sets before authorization", async () => {
    const duplicateResponse = await post({
      orgId: ORG_ID,
      targetEditorSessionIds: [TARGET_ID, TARGET_ID],
      endingEditorSessionId: ENDING_ID,
    });
    const unboundedResponse = await post({
      orgId: ORG_ID,
      targetEditorSessionIds: Array.from(
        { length: 21 },
        (_, index) => `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
      ),
      endingEditorSessionId: ENDING_ID,
    });

    expect(duplicateResponse.status).toBe(400);
    expect(unboundedResponse.status).toBe(400);
    expect(requireOrgPermissions).not.toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();
  });

  it("returns the organization authorization failure without writing", async () => {
    requireOrgPermissions.mockResolvedValueOnce({
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    });

    const response = await post({
      orgId: ORG_ID,
      targetEditorSessionIds: [TARGET_ID],
      endingEditorSessionId: ENDING_ID,
    });

    expect(response.status).toBe(403);
    expect(upsert).not.toHaveBeenCalled();
  });

  it("checks termination status only for the authenticated user's session", async () => {
    maybeSingle.mockResolvedValueOnce({
      data: { ended_at: "2026-09-02T22:00:00.000Z" },
      error: null,
    });
    const response = await GET(
      new NextRequest(
        `http://localhost/api/schedule/editor-sessions?orgId=${ORG_ID}&editorSessionId=${TARGET_ID}`,
      ),
    );

    await expect(response.json()).resolves.toEqual({
      ended: true,
      endedAt: "2026-09-02T22:00:00.000Z",
    });
    expect(eqOrg).toHaveBeenCalledWith("org_id", ORG_ID);
    expect(eqUser).toHaveBeenCalledWith("user_id", "user-1");
    expect(eqEditorSession).toHaveBeenCalledWith("editor_session_id", TARGET_ID);
  });

  // The terminations table arrives with migration 013, and the only remote-apply
  // path this project has is a full reset, so an environment can legitimately
  // run this code before the table exists. That must not 500 on every schedule
  // load and tab refocus.
  describe("when the terminations table is missing", () => {
    const missingTable = { code: "42P01", message: 'relation "..." does not exist' };
    const schemaCacheMiss = { code: "PGRST205", message: "Could not find the table" };

    it("reports no ended session rather than failing", async () => {
      maybeSingle.mockResolvedValue({ data: null, error: missingTable });

      const response = await GET(
        new NextRequest(
          `http://localhost/api/schedule/editor-sessions?orgId=${ORG_ID}&editorSessionId=${TARGET_ID}`,
        ),
      );

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ ended: false, endedAt: null });
    });

    it("treats a PostgREST schema-cache miss the same way", async () => {
      maybeSingle.mockResolvedValue({ data: null, error: schemaCacheMiss });

      const response = await GET(
        new NextRequest(
          `http://localhost/api/schedule/editor-sessions?orgId=${ORG_ID}&editorSessionId=${TARGET_ID}`,
        ),
      );

      expect(response.status).toBe(200);
    });

    // Ending a session genuinely cannot work without the table, so say so
    // instead of inviting a retry that can never succeed.
    it("tells the caller the action is unavailable instead of asking them to retry", async () => {
      upsert.mockResolvedValue({ error: missingTable });

      const response = await post({
        orgId: ORG_ID,
        targetEditorSessionIds: [TARGET_ID],
        endingEditorSessionId: ENDING_ID,
      });

      expect(response.status).toBe(503);
      const body = (await response.json()) as { error: string };
      expect(body.error).toMatch(/isn't available/i);
      expect(body.error).not.toMatch(/try again/i);
    });

    it("still surfaces a genuine database failure as an error", async () => {
      maybeSingle.mockResolvedValue({ data: null, error: { code: "57014", message: "timeout" } });

      const response = await GET(
        new NextRequest(
          `http://localhost/api/schedule/editor-sessions?orgId=${ORG_ID}&editorSessionId=${TARGET_ID}`,
        ),
      );

      expect(response.status).toBe(500);
    });
  });
});
