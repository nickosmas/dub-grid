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
vi.mock("@/lib/logger", () => ({ default: { error: vi.fn() } }));

import { GET, POST } from "./route";

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const TARGET_ID = "22222222-2222-4222-8222-222222222222";
const ENDING_ID = "33333333-3333-4333-8333-333333333333";

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
      targetEditorSessionId: TARGET_ID,
      endingEditorSessionId: ENDING_ID,
      userId: "user-2",
    });

    expect(response.status).toBe(200);
    expect(from).toHaveBeenCalledWith("schedule_editor_session_terminations");
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        org_id: ORG_ID,
        user_id: "user-1",
        editor_session_id: TARGET_ID,
        ended_by_editor_session_id: ENDING_ID,
      }),
      { onConflict: "org_id,user_id,editor_session_id" },
    );
  });

  it("cannot end the caller's own current editor session", async () => {
    const response = await post({
      orgId: ORG_ID,
      targetEditorSessionId: TARGET_ID,
      endingEditorSessionId: TARGET_ID,
    });

    expect(response.status).toBe(400);
    expect(requireOrgPermissions).not.toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();
  });

  it("returns the organization authorization failure without writing", async () => {
    requireOrgPermissions.mockResolvedValueOnce({
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    });

    const response = await post({
      orgId: ORG_ID,
      targetEditorSessionId: TARGET_ID,
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
});
