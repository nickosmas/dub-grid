import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const ACTOR_ID = "11111111-1111-4111-8111-111111111111";
const ORG_ID = "22222222-2222-4222-8222-222222222222";
const EMPLOYEE_ID = "33333333-3333-4333-8333-333333333333";

const validateCsrfOrigin = vi.fn();
const requireOrgPermissions = vi.fn();
const requireAuthenticatedUser = vi.fn();

vi.mock("@/lib/csrf", () => ({
  validateCsrfOrigin: (req: NextRequest) => validateCsrfOrigin(req),
}));

vi.mock("@/app/api/shared/permissions", () => ({
  requireOrgPermissions: (...args: unknown[]) => requireOrgPermissions(...args),
  resolveEffectiveOrgId: (_req: unknown, _userId: string, orgId: string) => Promise.resolve(orgId),
}));

vi.mock("@/lib/api-auth", () => ({
  requireAuthenticatedUser: (...args: unknown[]) => requireAuthenticatedUser(...args),
}));

vi.mock("@/app/api/shared/schedule", () => ({
  fetchAssignmentIdByPairMap: vi.fn(),
}));

import { POST } from "./route";

describe("POST /api/schedule/recurring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    validateCsrfOrigin.mockReturnValue(null);
    requireAuthenticatedUser.mockResolvedValue({ user: { id: ACTOR_ID, email: null } });
  });

  it("rejects CSRF failures before parsing or auth", async () => {
    validateCsrfOrigin.mockReturnValueOnce(
      NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    );
    const request = new NextRequest("http://localhost/api/schedule/recurring", {
      method: "POST",
      body: "{",
    });

    const response = await POST(request);

    expect(response.status).toBe(403);
    expect(requireOrgPermissions).not.toHaveBeenCalled();
  });

  // Draft cells are objects. The schema behind them crosses a package boundary,
  // and zod's `record(key, value)` overload check is `instanceof`, so a second
  // copy of zod on disk once made this whole record decay to
  // `Record<string, string>` and rejected every real draft as invalid input.
  it("stores a recurring draft whose cells are schedule-cell objects", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    const draftSession = {
      select: () => draftSession,
      eq: () => draftSession,
      maybeSingle: () => Promise.resolve({ data: null, error: null }),
      insert,
    };
    requireOrgPermissions.mockResolvedValue({
      actor: { id: ACTOR_ID, email: null },
      serviceClient: { from: () => draftSession },
    });

    const workedCell = {
      kind: "worked",
      segments: [{ shiftId: 4, jobId: 9, position: 0, isMentored: false }],
      absenceTypeId: null,
      customStartTime: null,
      customEndTime: null,
      seriesId: null,
      fromRecurring: true,
    };
    const draftData = { [EMPLOYEE_ID]: { "0": workedCell, "1": null } };

    const request = new NextRequest("http://localhost/api/schedule/recurring", {
      method: "POST",
      body: JSON.stringify({ action: "saveRecurringDraft", orgId: ORG_ID, draftData }),
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ org_id: ORG_ID, saved_by: ACTOR_ID, draft_data: draftData }),
    );
  });
});
