import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAuthenticatedUser = vi.fn();
const fetchSelfPeriodShifts = vi.fn();
const resolveEffectiveOrgId = vi.fn();

vi.mock("@/lib/api-auth", () => ({
  requireAuthenticatedUser: (req: NextRequest) => requireAuthenticatedUser(req),
}));
vi.mock("@/features/account/server", () => ({
  fetchSelfPeriodShifts: (...args: unknown[]) => fetchSelfPeriodShifts(...args),
}));
vi.mock("@/app/api/shared/permissions", () => ({
  resolveEffectiveOrgId: (...args: unknown[]) => resolveEffectiveOrgId(...args),
}));

import { GET } from "./route";

const USER_ID = "user-1";
const ORG_ID = "11111111-1111-1111-1111-111111111111";
const SANDBOX_ORG_ID = "99999999-9999-4999-8999-999999999999";

function makeRequest(params: Record<string, string>) {
  const url = new URL("http://localhost/api/account/self/shifts");
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return new NextRequest(url);
}

beforeEach(() => {
  vi.clearAllMocks();
  requireAuthenticatedUser.mockResolvedValue({ user: { id: USER_ID } });
  fetchSelfPeriodShifts.mockResolvedValue({ shift: true });
  resolveEffectiveOrgId.mockImplementation((_req, _userId, orgId) => Promise.resolve(orgId));
});

describe("GET /api/account/self/shifts", () => {
  it("returns the caller's shifts for the effective organization and period", async () => {
    resolveEffectiveOrgId.mockResolvedValue(SANDBOX_ORG_ID);

    const res = await GET(makeRequest({ orgId: ORG_ID, start: "2026-11-01", end: "2026-11-30" }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ shifts: { shift: true } });
    expect(resolveEffectiveOrgId).toHaveBeenCalledWith(expect.anything(), USER_ID, ORG_ID);
    expect(fetchSelfPeriodShifts).toHaveBeenCalledWith(USER_ID, SANDBOX_ORG_ID, {
      startDate: "2026-11-01",
      endDate: "2026-11-30",
    });
  });

  it.each([
    ["no organization", { start: "2026-11-01", end: "2026-11-30" }],
    ["a malformed date", { orgId: ORG_ID, start: "2026-11-1", end: "2026-11-30" }],
    ["an end before the start", { orgId: ORG_ID, start: "2026-11-30", end: "2026-11-01" }],
    ["more than a year", { orgId: ORG_ID, start: "2025-01-01", end: "2026-11-30" }],
  ])("refuses %s", async (_label, params) => {
    const res = await GET(makeRequest(params));

    expect(res.status).toBe(400);
    expect(fetchSelfPeriodShifts).not.toHaveBeenCalled();
  });

  it("answers the auth refusal as is", async () => {
    const refusal = new Response(null, { status: 401 });
    requireAuthenticatedUser.mockResolvedValue({ response: refusal });

    const res = await GET(makeRequest({ orgId: ORG_ID, start: "2026-11-01", end: "2026-11-30" }));

    expect(res).toBe(refusal);
    expect(fetchSelfPeriodShifts).not.toHaveBeenCalled();
  });
});
