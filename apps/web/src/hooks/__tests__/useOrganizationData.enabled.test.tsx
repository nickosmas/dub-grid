import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/useOrgRealtimeInvalidation", () => ({ useOrgRealtimeInvalidation: () => {} }));

import { useOrganizationData } from "@/hooks/useOrganizationData";

function requestedPaths(): string[] {
  return vi.mocked(fetch).mock.calls.map(([input]) => new URL(String(input), "http://x").pathname);
}

function renderOrganizationData(enabled: boolean) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderHook(() => useOrganizationData({ enabled }), {
    wrapper: ({ children }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
}

describe("useOrganizationData enabled flag", () => {
  beforeEach(() => {
    vi.spyOn(globalThis, "fetch").mockImplementation(
      async () =>
        new Response(JSON.stringify({}), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("asks for neither the org context nor the bootstrap while disabled", async () => {
    renderOrganizationData(false);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(requestedPaths()).toEqual([]);
  });

  it("asks for both once enabled", async () => {
    renderOrganizationData(true);
    await waitFor(() =>
      expect(requestedPaths()).toEqual(
        expect.arrayContaining(["/api/account/org-context", "/api/organization/bootstrap"]),
      ),
    );
  });
});
