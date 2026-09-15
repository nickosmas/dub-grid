import { beforeEach, describe, expect, it, vi } from "vitest";

const { getMySchedule, useQuery } = vi.hoisted(() => ({
  getMySchedule: vi.fn(),
  useQuery: vi.fn(),
}));

vi.mock("@tanstack/react-query", () => ({ useQuery }));
vi.mock("../../../shared/lib/api", () => ({ getMySchedule }));

import { useMyScheduleQuery } from "./useMyScheduleQuery";

function tokenFor(issuedAt: string): string {
  const encode = (value: object) =>
    btoa(JSON.stringify(value)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return [
    encode({ alg: "HS256", typ: "JWT" }),
    encode({ sub: "user-1", org_id: "org-1", iat: issuedAt }),
    "signature",
  ].join(".");
}

describe("useMyScheduleQuery", () => {
  beforeEach(() => {
    useQuery.mockReset();
    getMySchedule.mockReset();
    useQuery.mockReturnValue({});
  });

  it("keeps the rotated token out of the key and uses it only for the request", () => {
    const token = tokenFor("rotated");
    const signal = new AbortController().signal;

    useMyScheduleQuery(token);
    const options = useQuery.mock.calls[0]?.[0];
    options.queryFn({ signal });

    expect(JSON.stringify(options.queryKey)).not.toContain(token);
    expect(getMySchedule).toHaveBeenCalledWith(token, undefined, signal);
  });
});
