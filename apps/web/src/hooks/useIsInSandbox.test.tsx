import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { queryKeys } from "@/lib/query-keys";
import { useCanSeeBilling } from "./useIsInSandbox";

function wrapperWith(bootstrap: unknown) {
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
  client.setQueryData(queryKeys.org.bootstrap(), bootstrap);
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

const sandbox = (sandboxSourceRole: string | null) => ({
  org: { id: "sandbox", workspaceKind: "sandbox", sandboxSourceOrgId: "source" },
  sandboxSourceRole,
});

describe("useCanSeeBilling", () => {
  it("follows the caller's own role outside a sandbox", () => {
    const real = { org: { id: "org", workspaceKind: "real" } };
    expect(
      renderHook(() => useCanSeeBilling(true), { wrapper: wrapperWith(real) }).result.current,
    ).toBe(true);
    expect(
      renderHook(() => useCanSeeBilling(false), { wrapper: wrapperWith(real) }).result.current,
    ).toBe(false);
  });

  it("follows the role in the source organization inside a sandbox", () => {
    // Everyone is a Super Admin of the copy; billing belongs to the source.
    expect(
      renderHook(() => useCanSeeBilling(true), { wrapper: wrapperWith(sandbox("super_admin")) })
        .result.current,
    ).toBe(true);
    expect(
      renderHook(() => useCanSeeBilling(true), { wrapper: wrapperWith(sandbox("admin")) }).result
        .current,
    ).toBe(false);
    expect(
      renderHook(() => useCanSeeBilling(true), { wrapper: wrapperWith(sandbox(null)) }).result
        .current,
    ).toBe(false);
  });
});
