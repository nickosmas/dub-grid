import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const captureMessage = vi.fn();
vi.mock("@/lib/sentry", () => ({
  captureMessage: (...args: unknown[]) => captureMessage(...args),
}));

import {
  resetOrganizationConfigGuardMemory,
  useOrganizationConfigGuard,
} from "@/hooks/useOrganizationConfigGuard";

const staff = { status: "active" as const, focusAreaIds: [1], archivedAt: null };
const placed = {
  employees: [staff],
  focusAreas: [{ id: 1, departmentId: 10, archivedAt: null }],
  departments: [{ id: 10, type: "scheduled" as const, archivedAt: null }],
  assignments: [{ id: 100 }],
};
const unplaced = { ...placed, departments: [] };

function setup() {
  const client = new QueryClient();
  const refetchQueries = vi.spyOn(client, "refetchQueries").mockResolvedValue(undefined);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { refetchQueries, wrapper };
}

describe("useOrganizationConfigGuard", () => {
  beforeEach(() => {
    captureMessage.mockReset();
    resetOrganizationConfigGuardMemory();
  });

  it("does nothing while loading or when the settings agree", () => {
    const { refetchQueries, wrapper } = setup();
    const { result, rerender } = renderHook(({ input }) => useOrganizationConfigGuard(input), {
      wrapper,
      initialProps: { input: null as typeof placed | null },
    });
    rerender({ input: placed });
    expect(result.current.failed).toBe(false);
    expect(refetchQueries).not.toHaveBeenCalled();
  });

  it("reloads the settings once, then fails and reports if they still disagree", async () => {
    const { refetchQueries, wrapper } = setup();
    const { result, rerender } = renderHook(({ input }) => useOrganizationConfigGuard(input), {
      wrapper,
      initialProps: { input: unplaced as typeof placed | null },
    });
    await waitFor(() => expect(refetchQueries).toHaveBeenCalledTimes(1));
    rerender({ input: { ...unplaced } });
    await waitFor(() => expect(result.current.failed).toBe(true));
    expect(refetchQueries).toHaveBeenCalledTimes(1);
    expect(captureMessage).toHaveBeenCalledTimes(1);
    expect(captureMessage.mock.calls[0][0]).toContain("no-scheduled-sections");
    expect(captureMessage.mock.calls[0][1]).toBe("error");
  });

  it("recovers quietly when the reload brings consistent settings", async () => {
    const { refetchQueries, wrapper } = setup();
    let finish = () => {};
    refetchQueries.mockImplementationOnce(() => new Promise<void>((resolve) => (finish = resolve)));
    const { result, rerender } = renderHook(({ input }) => useOrganizationConfigGuard(input), {
      wrapper,
      initialProps: { input: unplaced as typeof placed | null },
    });
    await waitFor(() => expect(refetchQueries).toHaveBeenCalledTimes(1));
    // The fresh settings arrive as the refetch finishes.
    rerender({ input: placed });
    await act(async () => finish());
    expect(result.current.failed).toBe(false);
    expect(captureMessage).not.toHaveBeenCalled();
  });

  it("reloads only once when the page remounts during the reload", async () => {
    const { refetchQueries, wrapper } = setup();
    const first = renderHook(() => useOrganizationConfigGuard(unplaced), { wrapper });
    await waitFor(() => expect(refetchQueries).toHaveBeenCalledTimes(1));
    first.unmount();
    const second = renderHook(() => useOrganizationConfigGuard(unplaced), { wrapper });
    await waitFor(() => expect(second.result.current.failed).toBe(true));
    expect(refetchQueries).toHaveBeenCalledTimes(1);
    expect(captureMessage).toHaveBeenCalledTimes(1);
  });

  it("reloads again on Retry", async () => {
    const { refetchQueries, wrapper } = setup();
    const { result } = renderHook(() => useOrganizationConfigGuard(unplaced), { wrapper });
    await waitFor(() => expect(refetchQueries).toHaveBeenCalledTimes(1));
    await act(() => result.current.retry());
    expect(refetchQueries).toHaveBeenCalledTimes(2);
  });
});
