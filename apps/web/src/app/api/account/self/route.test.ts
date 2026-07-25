import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAuthenticatedUser = vi.fn();
const fetchSelfWorkProfileSnapshot = vi.fn();
const resolveEffectiveOrgId = vi.fn();

vi.mock("@/lib/api-auth", () => ({
  requireAuthenticatedUser: (req: NextRequest) => requireAuthenticatedUser(req),
}));
vi.mock("@/features/account/server", () => ({
  fetchSelfWorkProfileSnapshot: (...args: unknown[]) => fetchSelfWorkProfileSnapshot(...args),
}));
vi.mock("@/app/api/shared/permissions", () => ({
  resolveEffectiveOrgId: (...args: unknown[]) => resolveEffectiveOrgId(...args),
}));

import { GET } from "./route";

const USER_ID = "user-1";
const ORG_ID = "11111111-1111-1111-1111-111111111111";
const SANDBOX_ORG_ID = "99999999-9999-4999-8999-999999999999";

function makeRequest(orgId?: string) {
  const url = new URL("http://localhost/api/account/self");
  if (orgId) url.searchParams.set("orgId", orgId);
  return new NextRequest(url);
}

beforeEach(() => {
  vi.clearAllMocks();
  requireAuthenticatedUser.mockResolvedValue({ user: { id: USER_ID } });
  fetchSelfWorkProfileSnapshot.mockResolvedValue({ employee: null });
  resolveEffectiveOrgId.mockImplementation((_req, _userId, orgId) => Promise.resolve(orgId));
});

describe("GET /api/account/self", () => {
  it("does not call resolveEffectiveOrgId when no orgId is supplied", async () => {
    const res = await GET(makeRequest());

    expect(res.status).toBe(200);
    expect(resolveEffectiveOrgId).not.toHaveBeenCalled();
    expect(fetchSelfWorkProfileSnapshot).toHaveBeenCalledWith(USER_ID, null);
  });

  it("fetches the snapshot for the requested org when no sandbox is active", async () => {
    const res = await GET(makeRequest(ORG_ID));

    expect(res.status).toBe(200);
    expect(fetchSelfWorkProfileSnapshot).toHaveBeenCalledWith(USER_ID, ORG_ID);
  });

  it("fetches the snapshot for the effective (sandbox-redirected) org, not the raw query org id", async () => {
    resolveEffectiveOrgId.mockResolvedValue(SANDBOX_ORG_ID);

    const res = await GET(makeRequest(ORG_ID));

    expect(res.status).toBe(200);
    expect(resolveEffectiveOrgId).toHaveBeenCalledWith(expect.anything(), USER_ID, ORG_ID);
    expect(fetchSelfWorkProfileSnapshot).toHaveBeenCalledWith(USER_ID, SANDBOX_ORG_ID);
  });
});
