import { beforeEach, describe, expect, it, vi } from "vitest";

const requireMobileAuth = vi.fn();
const fetchLinkedEmployeeForUser = vi.fn();
const fetchMobileScheduleEntries = vi.fn();
const fetchMobileHiddenPeople = vi.fn();

vi.mock("@/features/mobile/server", () => ({
  fetchLinkedEmployeeForUser,
  fetchMobileHiddenPeople,
  fetchMobileScheduleEntries,
  requireMobileAuth,
}));

// The entries below carry only what swap matching reads, so the response is
// checked for what the route does to them, not re-validated in full.
vi.mock("@dubgrid/contracts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@dubgrid/contracts")>();
  return {
    ...actual,
    mobileShiftSwapOptionsResponseSchema: { parse: (value: unknown) => value },
  };
});

const REQUESTER_ID = "6d0f8c3a-2b1e-4c5d-9a8b-7c6d5e4f3a2b";
const PARTNER_ID = "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";

function workedEntry(employeeId: string, date: string) {
  return {
    employeeId,
    employeeFocusAreaIds: [1],
    date,
    state: { kind: "worked", segments: [{ shiftId: 10, jobId: 20, position: 0 }] },
    presentation: {
      label: "Day",
      focusAreaId: 1,
      startTime: "07:00:00",
      endTime: "15:00:00",
      segments: [],
    },
    change: {
      kind: "modified",
      isNewAddition: false,
      previousPresentation: { label: "E", name: "Evening" },
      shiftChange: { before: "Evening", after: "Day" },
    },
    publishedAt: "2026-11-10T18:00:00Z",
    publishedByName: "Nic Kosmas",
  };
}

function staffPool() {
  const query = {
    select: () => query,
    eq: () => query,
    is: () => query,
    or: () => query,
    then: (resolve: (value: unknown) => unknown) =>
      Promise.resolve({ data: [{ id: REQUESTER_ID }, { id: PARTNER_ID }], error: null }).then(
        resolve,
      ),
  };
  return { from: () => query };
}

function authFor(org: Record<string, unknown>) {
  return {
    currentOrg: { id: "org-1", ...org },
    user: { id: "user-1" },
    permissions: {
      canEditShifts: false,
      canPublishSchedule: false,
      canApproveShiftRequests: false,
      canManageEmployees: false,
      level: 1,
    },
    serviceClient: staffPool(),
  };
}

async function swapOptions() {
  const { GET } = await import("./shift-swap-options");
  const url = new URL("http://localhost/api/mobile/v1/shift-swap-options");
  url.searchParams.set("requesterEmpId", REQUESTER_ID);
  url.searchParams.set("requesterShiftDate", "2026-11-16");
  url.searchParams.set("startDate", "2026-11-15");
  url.searchParams.set("endDate", "2026-11-21");
  const response = await GET(Object.assign(new Request(url), { nextUrl: url }) as never);
  return { status: response.status, body: await response.json() };
}

describe("GET shift swap options", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchLinkedEmployeeForUser.mockResolvedValue({ id: REQUESTER_ID });
    fetchMobileHiddenPeople.mockResolvedValue([]);
    fetchMobileScheduleEntries.mockResolvedValue([
      workedEntry(REQUESTER_ID, "2026-11-16"),
      workedEntry(PARTNER_ID, "2026-11-17"),
    ]);
  });

  it("shows staff a partner's publisher and earlier shift when the organization allows it", async () => {
    requireMobileAuth.mockResolvedValue(authFor({}));
    const { status, body } = await swapOptions();

    expect(status).toBe(200);
    expect(body.entries).toHaveLength(1);
    expect(body.entries[0]).toMatchObject({
      employeeId: PARTNER_ID,
      publishedByName: "Nic Kosmas",
      change: { previousPresentation: { label: "E", name: "Evening" } },
    });
  });

  it("withholds them from staff when the organization hides them (F-206)", async () => {
    requireMobileAuth.mockResolvedValue(
      authFor({ staffSeePublisher: false, staffSeeShiftChanges: false }),
    );
    const { status, body } = await swapOptions();

    expect(status).toBe(200);
    expect(body.entries[0]).toMatchObject({
      employeeId: PARTNER_ID,
      publishedByName: null,
      publishedAt: "2026-11-10T18:00:00Z",
      change: { kind: "modified", previousPresentation: null, shiftChange: null },
    });
  });
});
