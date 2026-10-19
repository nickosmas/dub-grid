import { describe, expect, it, vi } from "vitest";

const useQuery = vi.fn();

vi.mock("@tanstack/react-query", () => ({
  useQuery: (...args: unknown[]) => useQuery(...args),
}));
vi.mock("../../../shared/lib/query-client", () => ({ queryClient: {} }));
vi.mock("../../../shared/lib/session", () => ({
  loadHasSeenOnboarding: async () => true,
  saveHasSeenOnboarding: async () => undefined,
}));

import { useHasSeenOnboarding } from "./useHasSeenOnboarding";

describe("useHasSeenOnboarding", () => {
  // The launch splash waits on this flag. Read from the device, it must not
  // pause on React Query's offline flag and hold the splash.
  it("reads the flag whatever the network state", () => {
    useQuery.mockReturnValue({});
    useHasSeenOnboarding();

    expect(useQuery.mock.calls.at(-1)?.[0]).toMatchObject({ networkMode: "always" });
  });
});
