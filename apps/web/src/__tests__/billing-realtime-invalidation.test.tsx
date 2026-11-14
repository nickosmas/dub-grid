import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getBillingRealtimeInvalidationKeys,
  useBillingRealtimeInvalidation,
} from "@/features/billing/useBillingRealtimeInvalidation";
import { queryKeys } from "@/lib/query-keys";

type TableListener = { table: string; topic: string; onEvent: () => void };
const mockSubscribe = vi.fn();
const mockRelease = vi.fn();

vi.mock("@dubgrid/realtime-core", () => ({
  orgTopic: (orgId: string) => `org:${orgId}`,
  subscribeToTableChanges: (_client: unknown, listeners: TableListener[]) => {
    mockSubscribe(listeners);
    return mockRelease;
  },
}));

vi.mock("@/features/account/client", () => ({ getBrowserSupabaseClient: () => ({}) }));

vi.mock("@/lib/cache-broadcast", () => ({
  broadcastInvalidation: vi.fn(),
}));

vi.mock("@/lib/sentry", () => ({
  captureException: vi.fn(),
}));

function createWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe("billing realtime invalidation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("targets billing and shell queries for billing changes", () => {
    expect(getBillingRealtimeInvalidationKeys("org-1")).toEqual([
      queryKeys.org.billing("org-1"),
      queryKeys.org.bootstrap(),
      queryKeys.org.detail("org-1"),
    ]);
  });

  it("subscribes to organization and subscription changes for the org", () => {
    const queryClient = new QueryClient();

    const { unmount } = renderHook(() => useBillingRealtimeInvalidation("org-1"), {
      wrapper: createWrapper(queryClient),
    });

    const [listeners] = mockSubscribe.mock.calls[0] as [TableListener[]];
    expect(listeners.map(({ table, topic }) => [table, topic])).toEqual([
      ["organizations", "org:org-1"],
      ["subscriptions", "org:org-1"],
    ]);

    unmount();

    expect(mockRelease).toHaveBeenCalledOnce();
  });
});
