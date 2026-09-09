import { beforeEach, describe, expect, it, vi } from "vitest";

const { getDashboard, useQuery } = vi.hoisted(() => ({
  getDashboard: vi.fn(),
  useQuery: vi.fn(),
}));

vi.mock("@tanstack/react-query", () => ({ useQuery }));
vi.mock("../../../shared/lib/api", () => ({ getDashboard }));

import { useAdminDashboard } from "./useAdminDashboard";

function tokenFor(issuedAt: string): string {
  const encode = (value: object) =>
    btoa(JSON.stringify(value)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return [
    encode({ alg: "HS256", typ: "JWT" }),
    encode({ sub: "user-1", org_id: "org-1", iat: issuedAt }),
    "signature",
  ].join(".");
}

describe("useAdminDashboard", () => {
  beforeEach(() => {
    useQuery.mockReset();
    getDashboard.mockReset();
    useQuery.mockReturnValue({});
  });

  it("keeps the rotated token out of the key and uses it only for the request", () => {
    const token = tokenFor("rotated");
    const range = { startDate: "2026-09-06", endDate: "2026-09-12" };
    const signal = new AbortController().signal;

    useAdminDashboard(token, range);
    const options = useQuery.mock.calls[0]?.[0];
    options.queryFn({ signal });

    expect(JSON.stringify(options.queryKey)).not.toContain(token);
    expect(getDashboard).toHaveBeenCalledWith(token, range, signal);
  });
});
