import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { fetchScheduleNotes } from "@/features/schedule/client";
import { queryKeys } from "@/lib/query-keys";
import type { ScheduleNote } from "@/types";
import { useDashboardScheduleNotes } from "./useDashboardScheduleNotes";

vi.mock("@/features/schedule/client", () => ({
  fetchScheduleNotes: vi.fn(),
}));

const note = {
  id: 1,
  orgId: "org-1",
  empId: "emp-1",
  date: "2026-09-28",
  indicatorTypeId: 7,
  focusAreaId: null,
  status: "published",
  createdBy: null,
  updatedBy: null,
  createdAt: "2026-09-27T00:00:00Z",
} as ScheduleNote;

const window = { start: "2026-09-20", end: "2026-10-03" };

function setup() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return {
    queryClient,
    ...renderHook(() => useDashboardScheduleNotes("org-1", window), { wrapper }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("useDashboardScheduleNotes", () => {
  it("requests the dashboard window's notes", async () => {
    vi.mocked(fetchScheduleNotes).mockResolvedValue([note]);

    const { result } = setup();

    await waitFor(() => expect(result.current).toEqual([note]));
    expect(fetchScheduleNotes).toHaveBeenCalledWith("org-1", "2026-09-20", "2026-10-03");
  });

  it("shows no notes when the request fails", async () => {
    vi.mocked(fetchScheduleNotes).mockRejectedValue(new Error("offline"));

    const { result } = setup();

    await waitFor(() => expect(fetchScheduleNotes).toHaveBeenCalled());
    expect(result.current).toEqual([]);
  });

  it("refreshes when the organization's schedule notes change", async () => {
    vi.mocked(fetchScheduleNotes).mockResolvedValue([note]);
    const { queryClient, result } = setup();
    await waitFor(() => expect(result.current).toEqual([note]));

    // What the realtime `schedule_notes` handler invalidates.
    await act(() => queryClient.invalidateQueries({ queryKey: queryKeys.shifts.all("org-1") }));

    expect(fetchScheduleNotes).toHaveBeenCalledTimes(2);
  });
});
