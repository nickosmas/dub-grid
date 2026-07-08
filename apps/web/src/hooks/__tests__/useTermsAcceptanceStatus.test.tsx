import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "@supabase/supabase-js";
import { useTermsAcceptanceStatus } from "@/hooks/useTermsAcceptanceStatus";

// Mock react-query so the test exercises the hook's contract (the query key it
// builds + the enabled flag) without mounting react-query's provider — which
// otherwise resolves react-query's source and pulls a duplicate React.
type QueryOpts = { queryKey: readonly unknown[]; enabled?: boolean; queryFn?: unknown };
const useQuery = vi.fn((_opts: QueryOpts) => ({ data: undefined as unknown }));
vi.mock("@tanstack/react-query", () => ({
  useQuery: (opts: QueryOpts) => useQuery(opts),
}));

vi.mock("@/features/account/client", () => ({
  fetchTermsAcceptanceStatus: vi.fn(),
}));

const mockUseAuth = vi.fn();
vi.mock("@/components/AuthProvider", () => ({
  useAuth: () => mockUseAuth(),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("useTermsAcceptanceStatus", () => {
  it("builds a stable query key from the user id even when the user OBJECT identity changes", () => {
    // Simulates SIGNED_IN -> TOKEN_REFRESHED minting a fresh user reference,
    // which previously re-fired the gate's fetch and made the modal flash.
    mockUseAuth.mockReturnValue({ user: { id: "u-1" } as User, isLoading: false });
    const { rerender } = renderHook(() => useTermsAcceptanceStatus());

    const firstKey = useQuery.mock.calls[0]![0].queryKey;
    expect(firstKey).toEqual(["account", "u-1", "terms"]);
    expect(useQuery.mock.calls[0]![0].enabled).toBe(true);

    // New object, same id — the key must be value-equal so react-query reuses
    // the cached query rather than refetching.
    mockUseAuth.mockReturnValue({ user: { id: "u-1" } as User, isLoading: false });
    rerender();

    const secondKey = useQuery.mock.calls.at(-1)![0].queryKey;
    expect(secondKey).toEqual(firstKey);
  });

  it("disables the query while auth is still loading", () => {
    mockUseAuth.mockReturnValue({ user: null, isLoading: true });
    renderHook(() => useTermsAcceptanceStatus());
    expect(useQuery.mock.calls[0]![0].enabled).toBe(false);
  });
});
