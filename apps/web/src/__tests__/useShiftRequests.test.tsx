import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useShiftRequests } from "@/hooks/useShiftRequests";
import type { ShiftRequest } from "@/types";

const mockFetchShiftRequests = vi.fn();
const mockClaimShiftRequest = vi.fn();
const mockToastSuccess = vi.fn();
const mockToastError = vi.fn();
const mockQueueNotification = vi.fn();
const mockCaptureException = vi.fn();

vi.mock("@/features/schedule/client", () => ({
  cancelShiftRequest: vi.fn(),
  claimShiftRequest: (...args: unknown[]) => mockClaimShiftRequest(...args),
  createShiftRequest: vi.fn(),
  fetchShiftRequests: (...args: unknown[]) => mockFetchShiftRequests(...args),
  resolveShiftRequest: vi.fn(),
  respondToShiftRequest: vi.fn(),
  volunteerForOpenShift: vi.fn(),
}));

// The hook no longer opens a channel of its own; it lives under the org's
// shiftRequests query prefix, which the shared org realtime channel
// invalidates (build plan item 29). Any use of the raw channel API here
// would be a regression.
const mockCreateBrowserRealtimeChannel = vi.fn();
vi.mock("@/features/account/client", () => ({
  createBrowserRealtimeChannel: (...args: unknown[]) => mockCreateBrowserRealtimeChannel(...args),
  removeBrowserRealtimeChannel: vi.fn(),
}));

// react-query delivers results through a batched notify timer, and this
// suite runs on fake timers, so a resolved fetch only reaches the hook once
// pending timers are flushed too.
async function flush() {
  await act(async () => {
    await Promise.resolve();
    await vi.runOnlyPendingTimersAsync();
  });
}

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => mockToastSuccess(...args),
    error: (...args: unknown[]) => mockToastError(...args),
  },
}));

vi.mock("@/lib/notify", () => ({
  queueNotification: (...args: unknown[]) => mockQueueNotification(...args),
}));

vi.mock("@/lib/sentry", () => ({
  captureException: (...args: unknown[]) => mockCaptureException(...args),
}));

function buildRequest(overrides: Partial<ShiftRequest> = {}): ShiftRequest {
  return {
    id: "request-1",
    orgId: "org-1",
    type: "pickup",
    status: "open",
    requesterEmpId: "requester-1",
    requesterName: "Alex Taylor",
    requesterShiftDate: "2026-04-18",
    requesterState: {
      kind: "worked",
      segments: [{ shiftId: 5, jobId: 8, position: 0 }],
      absenceTypeId: null,
      customStartTime: null,
      customEndTime: null,
      seriesId: null,
      fromRecurring: false,
    },
    requesterPresentation: {
      label: "Day Shift",
      focusAreaId: 11,
      focusAreaName: "Skilled Nursing",
      displayFocusAreaName: "Skilled Nursing",
      startTime: null,
      endTime: null,
      segments: [
        {
          shiftId: 5,
          jobId: 8,
          label: "D",
          shiftName: "Day Shift",
          jobName: "Nurse",
          startTime: "15:00:00",
          endTime: "23:00:00",
          displayFocusAreaName: "Skilled Nursing",
        },
      ],
    },
    requesterShiftIds: [5],
    requesterJobIds: [8],
    requesterSegments: [
      {
        shiftId: 5,
        jobId: 8,
        label: "D",
        shiftName: "Day Shift",
        jobName: "Nurse",
        startTime: "15:00:00",
        endTime: "23:00:00",
      },
    ],
    requesterAssignmentDefinitionIds: [21],
    requesterShiftLabel: "Day Shift",
    requesterFocusAreaId: 11,
    requesterCustomStartTime: null,
    requesterCustomEndTime: null,
    targetEmpId: null,
    targetName: null,
    targetShiftDate: null,
    targetState: null,
    targetPresentation: null,
    targetShiftIds: null,
    targetJobIds: null,
    targetSegments: null,
    targetAssignmentDefinitionIds: null,
    targetShiftLabel: null,
    targetFocusAreaId: null,
    targetCustomStartTime: null,
    targetCustomEndTime: null,
    absenceTypeId: null,
    parentRequestId: null,
    adminUserId: null,
    adminNote: null,
    expiresAt: "2099-04-19T00:00:00.000Z",
    resolvedAt: null,
    createdAt: "2026-04-17T00:00:00.000Z",
    updatedAt: "2026-04-17T00:00:00.000Z",
    ...overrides,
  };
}

describe("useShiftRequests", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-18T12:00:00.000Z"));
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("hides started active requests using the organization timezone", async () => {
    mockFetchShiftRequests.mockResolvedValue([
      buildRequest({
        id: "started-request",
        requesterPresentation: {
          label: "Morning Pickup",
          focusAreaId: 11,
          focusAreaName: "Skilled Nursing",
          displayFocusAreaName: "Skilled Nursing",
          startTime: null,
          endTime: null,
          segments: [
            {
              shiftId: 5,
              jobId: 8,
              label: "M",
              shiftName: "Morning Shift",
              jobName: "Nurse",
              startTime: "04:00:00",
              endTime: "12:00:00",
              displayFocusAreaName: "Skilled Nursing",
            },
          ],
        },
      }),
      buildRequest({
        id: "future-request",
      }),
    ]);

    const { result } = renderHook(
      () => useShiftRequests("org-1", new Map(), "claimer-1", false, "America/Los_Angeles"),
      { wrapper },
    );

    await flush();

    expect(result.current.requests.map((request) => request.id)).toEqual(["future-request"]);
    expect(result.current.openPickups.map((request) => request.id)).toEqual(["future-request"]);
  });

  it("refetches requests after a successful claim even without realtime", async () => {
    mockFetchShiftRequests
      .mockResolvedValueOnce([buildRequest({ id: "claimable-request" })])
      .mockResolvedValueOnce([]);
    mockClaimShiftRequest.mockResolvedValue({ autoApproved: false });

    const { result } = renderHook(
      () => useShiftRequests("org-1", new Map(), "claimer-1", false, "America/Los_Angeles"),
      { wrapper },
    );

    await flush();

    await act(async () => {
      await result.current.claim("claimable-request", "claimer-1");
    });
    await flush();

    expect(result.current.requests).toEqual([]);

    expect(mockClaimShiftRequest).toHaveBeenCalledWith("claimable-request", "claimer-1", "org-1");
    expect(mockFetchShiftRequests).toHaveBeenCalledTimes(2);
    expect(mockToastSuccess).toHaveBeenCalledWith("Claim request sent", {
      description: "Your shift is pending approval.",
    });
  });

  it("says the shift is theirs when the claim settled on the spot", async () => {
    mockFetchShiftRequests.mockResolvedValue([]);
    mockClaimShiftRequest.mockResolvedValue({ autoApproved: true });

    const { result } = renderHook(
      () => useShiftRequests("org-1", new Map(), "claimer-1", true, "America/Los_Angeles"),
      { wrapper },
    );
    await flush();

    await act(async () => {
      await result.current.claim("claimable-request", "claimer-1");
    });

    expect(mockToastSuccess).toHaveBeenCalledWith("Shift is yours", {
      description: "The claim was approved and is on the schedule.",
    });
  });

  it("only shows targeted pickup requests to the requested teammate", async () => {
    mockFetchShiftRequests.mockResolvedValue([
      buildRequest({ id: "public-pickup" }),
      buildRequest({
        id: "targeted-for-me",
        targetEmpId: "claimer-1",
        targetName: "Casey Target",
        targetShiftDate: "2026-04-18",
        absenceTypeId: 7,
      }),
      buildRequest({
        id: "targeted-for-someone-else",
        targetEmpId: "other-emp",
        targetName: "Other Teammate",
        targetShiftDate: "2026-04-18",
        absenceTypeId: 7,
      }),
    ]);

    const { result } = renderHook(
      () => useShiftRequests("org-1", new Map(), "claimer-1", false, "America/Los_Angeles"),
      { wrapper },
    );

    await flush();

    expect(result.current.openPickups.map((request) => request.id)).toEqual([
      "public-pickup",
      "targeted-for-me",
    ]);
    expect(result.current.badgeCount).toBe(1);
  });

  it("counts every active request for an approver, matching the Approval Queue tab", async () => {
    mockFetchShiftRequests.mockResolvedValue([
      buildRequest({ id: "public-pickup" }),
      buildRequest({ id: "pending-swap", type: "swap", status: "pending_approval" }),
      buildRequest({
        id: "targeted-for-me",
        targetEmpId: "claimer-1",
        targetName: "Casey Target",
        targetShiftDate: "2026-04-18",
        absenceTypeId: 7,
      }),
    ]);

    const { result } = renderHook(
      () => useShiftRequests("org-1", new Map(), "claimer-1", true, "America/Los_Angeles"),
      { wrapper },
    );

    await flush();

    expect(result.current.badgeCount).toBe(3);
  });

  it("omits date filters by default but threads them through when a dateRange is given", async () => {
    mockFetchShiftRequests.mockResolvedValue([]);

    const { rerender } = renderHook(
      ({ dateRange }: { dateRange?: { startDate: string; endDate: string } }) =>
        useShiftRequests("org-1", new Map(), "claimer-1", false, "America/Los_Angeles", dateRange),
      { initialProps: {}, wrapper },
    );

    await flush();

    expect(mockFetchShiftRequests).toHaveBeenLastCalledWith(
      "org-1",
      expect.any(Map),
      expect.not.objectContaining({ startDate: expect.anything() }),
    );

    rerender({ dateRange: { startDate: "2026-04-14", endDate: "2026-04-20" } });

    await flush();

    expect(mockFetchShiftRequests).toHaveBeenLastCalledWith(
      "org-1",
      expect.any(Map),
      expect.objectContaining({ startDate: "2026-04-14", endDate: "2026-04-20" }),
    );
  });

  it("does not open a realtime channel of its own", async () => {
    mockFetchShiftRequests.mockResolvedValue([]);

    renderHook(
      () => useShiftRequests("org-1", new Map(), "claimer-1", false, "America/Los_Angeles"),
      { wrapper },
    );
    await flush();

    expect(mockCreateBrowserRealtimeChannel).not.toHaveBeenCalled();
  });

  it("fetches every status when asked and still reports only the active ones", async () => {
    mockFetchShiftRequests.mockResolvedValue([
      buildRequest({ id: "open-request", status: "open" }),
      buildRequest({ id: "settled-request", status: "approved" }),
    ]);

    const { result } = renderHook(
      () =>
        useShiftRequests(
          "org-1",
          new Map(),
          "claimer-1",
          false,
          "America/Los_Angeles",
          { startDate: "2026-04-14", endDate: "2026-04-20" },
          { includeAllStatuses: true },
        ),
      { wrapper },
    );
    await flush();

    expect(mockFetchShiftRequests).toHaveBeenLastCalledWith(
      "org-1",
      expect.any(Map),
      expect.not.objectContaining({ status: expect.anything() }),
    );
    expect(result.current.allRequests.map((request) => request.id)).toEqual([
      "open-request",
      "settled-request",
    ]);
    expect(result.current.requests.map((request) => request.id)).toEqual(["open-request"]);
  });
});
