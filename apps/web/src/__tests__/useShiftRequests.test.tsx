import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useShiftRequests } from "@/hooks/useShiftRequests";
import type { ShiftRequest } from "@/types";

const mockFetchShiftRequests = vi.fn();
const mockClaimShiftRequest = vi.fn();
const mockCreateBrowserRealtimeChannel = vi.fn();
const mockRemoveBrowserRealtimeChannel = vi.fn();
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

vi.mock("@/features/account/client", () => ({
  createBrowserRealtimeChannel: (...args: unknown[]) =>
    mockCreateBrowserRealtimeChannel(...args),
  removeBrowserRealtimeChannel: (...args: unknown[]) =>
    mockRemoveBrowserRealtimeChannel(...args),
}));

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

    const channel = {
      on: vi.fn(),
      subscribe: vi.fn(),
      state: "joined",
    };
    channel.on.mockReturnValue(channel);
    channel.subscribe.mockReturnValue(channel);
    mockCreateBrowserRealtimeChannel.mockReturnValue(channel);
    mockRemoveBrowserRealtimeChannel.mockResolvedValue("ok");
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

    const { result } = renderHook(() =>
      useShiftRequests(
        "org-1",
        new Map(),
        "claimer-1",
        false,
        "America/Los_Angeles",
      ),
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.requests.map((request) => request.id)).toEqual([
      "future-request",
    ]);
    expect(result.current.openPickups.map((request) => request.id)).toEqual([
      "future-request",
    ]);
  });

  it("refetches requests after a successful claim even without realtime", async () => {
    mockFetchShiftRequests
      .mockResolvedValueOnce([buildRequest({ id: "claimable-request" })])
      .mockResolvedValueOnce([]);
    mockClaimShiftRequest.mockResolvedValue(undefined);

    const { result } = renderHook(() =>
      useShiftRequests(
        "org-1",
        new Map(),
        "claimer-1",
        false,
        "America/Los_Angeles",
      ),
    );

    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      await result.current.claim("claimable-request", "claimer-1");
    });

    expect(result.current.requests).toEqual([]);

    expect(mockClaimShiftRequest).toHaveBeenCalledWith(
      "claimable-request",
      "claimer-1",
      "org-1",
    );
    expect(mockFetchShiftRequests).toHaveBeenCalledTimes(2);
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

    const { result } = renderHook(() =>
      useShiftRequests(
        "org-1",
        new Map(),
        "claimer-1",
        false,
        "America/Los_Angeles",
      ),
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.openPickups.map((request) => request.id)).toEqual([
      "public-pickup",
      "targeted-for-me",
    ]);
    expect(result.current.badgeCount).toBe(1);
  });
});
