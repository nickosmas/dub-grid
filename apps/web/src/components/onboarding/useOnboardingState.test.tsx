import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { queryKeys } from "@/lib/query-keys";
import { useOnboardingState } from "./useOnboardingState";

const completeOnboardingRequest = vi.fn();
const markOnboardingComplete = vi.fn();
const clearOnboardingPhase = vi.fn();
const broadcastInvalidation = vi.fn();

vi.mock("@/features/onboarding/client", () => ({
  completeOnboarding: (...args: unknown[]) => completeOnboardingRequest(...args),
  markOnboardingComplete: (...args: unknown[]) => markOnboardingComplete(...args),
  clearOnboardingPhase: (...args: unknown[]) => clearOnboardingPhase(...args),
}));

vi.mock("@/lib/cache-broadcast", () => ({
  broadcastInvalidation: (...args: unknown[]) => broadcastInvalidation(...args),
}));

const COMPLETED_AT = "2026-09-01T08:00:00.000Z";

describe("useOnboardingState completion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    completeOnboardingRequest.mockResolvedValue({ success: true, completedAt: COMPLETED_AT });
  });

  it("patches the bootstrap cache and broadcasts only after verified completion", async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(queryKeys.org.bootstrap(), {
      org: { id: "org-1" },
      entryGate: { onboardingCompleted: false, billingLocked: null },
    });
    const wrapper = ({ children }: PropsWithChildren) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(
      () => useOnboardingState("user-1", "org-1", [{ id: "done", label: "Done" }], "user"),
      { wrapper },
    );

    await act(async () => {
      await result.current.completeOnboarding();
    });

    expect(completeOnboardingRequest).toHaveBeenCalledWith("org-1");
    expect(queryClient.getQueryData(queryKeys.org.bootstrap())).toMatchObject({
      org: { id: "org-1" },
      entryGate: { onboardingCompleted: true, billingLocked: null },
    });
    expect(queryClient.getQueryData(["onboarding-status", "user-1", "org-1"])).toEqual({
      completed: true,
      completedAt: COMPLETED_AT,
      tooltipToursCompleted: {},
    });
    expect(broadcastInvalidation).toHaveBeenCalledWith(queryKeys.org.bootstrap());
    expect(markOnboardingComplete).toHaveBeenCalledWith("user-1", "org-1");
    expect(clearOnboardingPhase).toHaveBeenCalledWith("user-1", "org-1");
  });

  it("keeps the gate incomplete when persistence verification fails", async () => {
    completeOnboardingRequest.mockRejectedValueOnce(new Error("Completion was not persisted"));
    const queryClient = new QueryClient();
    queryClient.setQueryData(queryKeys.org.bootstrap(), {
      org: { id: "org-1" },
      entryGate: { onboardingCompleted: false, billingLocked: null },
    });
    const wrapper = ({ children }: PropsWithChildren) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(
      () => useOnboardingState("user-1", "org-1", [{ id: "done", label: "Done" }], "user"),
      { wrapper },
    );

    await expect(
      act(async () => {
        await result.current.completeOnboarding();
      }),
    ).rejects.toThrow("Completion was not persisted");

    expect(queryClient.getQueryData(queryKeys.org.bootstrap())).toMatchObject({
      entryGate: { onboardingCompleted: false },
    });
    expect(broadcastInvalidation).not.toHaveBeenCalled();
    expect(markOnboardingComplete).not.toHaveBeenCalled();
  });
});
