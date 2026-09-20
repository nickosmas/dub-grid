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

  it("keys the dashboard's period into the query and requests that range", () => {
    const token = tokenFor("current");
    const range = { startDate: "2026-09-20", endDate: "2026-10-03" };
    const signal = new AbortController().signal;

    useMyScheduleQuery(token, { range });
    const options = useQuery.mock.calls[0]?.[0];
    options.queryFn({ signal });

    expect(options.queryKey).toEqual(expect.arrayContaining(["2026-09-20", "2026-10-03"]));
    expect(getMySchedule).toHaveBeenCalledWith(token, range, signal);
    // A period change keeps the previous week on screen until the new one lands.
    expect(options.placeholderData).toEqual(expect.any(Function));
  });
});
