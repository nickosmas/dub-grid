import { renderHook } from "@testing-library/react";
import { onlineManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/useOrgRealtimeInvalidation", () => ({ useOrgRealtimeInvalidation: () => {} }));

import { useOrganizationData } from "@/hooks/useOrganizationData";
import { queryKeys } from "@/lib/query-keys";

function renderOrganizationData() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  // The organization is already known for the session; only its settings are
  // missing, as when they were dropped and could not be fetched again.
  client.setQueryData(queryKeys.account.orgContext(), { orgId: "org-1", isGridmaster: false });
  return renderHook(() => useOrganizationData(), {
    wrapper: ({ children }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
}

describe("useOrganizationData loading", () => {
  beforeEach(() => {
    vi.spyOn(globalThis, "fetch").mockImplementation(
      async () =>
        new Response(JSON.stringify({ orgId: "org-1" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
  });

  afterEach(() => {
    onlineManager.setOnline(true);
    vi.restoreAllMocks();
  });

  // 2026-11-15: a settings fetch paused while the browser was offline (waking
  // from sleep) read as loaded, so Schedule showed "Nobody assigned here yet"
  // and the dashboard "?" shifts.
  it("stays loading while the settings fetch is paused offline", async () => {
    onlineManager.setOnline(false);
    const { result } = renderOrganizationData();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(result.current.loading).toBe(true);
    expect(result.current.departments).toEqual([]);
  });
});
