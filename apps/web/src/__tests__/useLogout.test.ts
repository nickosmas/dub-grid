import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useLogout } from "@/hooks/useLogout";

const mockBeginLogout = vi.fn();
const mockSignOutFromBrowser = vi.fn();
const mockReplace = vi.fn();

vi.mock("@/lib/logout-state", () => ({
  beginLogout: () => mockBeginLogout(),
}));

vi.mock("@/features/account/client", () => ({
  signOutFromBrowser: (...args: unknown[]) => mockSignOutFromBrowser(...args),
}));

Object.defineProperty(window, "location", {
  value: { replace: mockReplace, origin: "https://acme.dubgrid.com" },
  writable: true,
});

describe("useLogout.signOut", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("defaults to /goodbye with scope=local and silences in-flight query errors first", () => {
    const { result } = renderHook(() => useLogout());

    result.current.signOut();

    // beginLogout MUST run before the navigation so error handlers stay silent
    // during the brief window before the page unloads.
    expect(mockBeginLogout).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledWith("/goodbye?scope=local");
    // Critically: signOut() must NOT call signOutFromBrowser. The teardown
    // belongs to RunLogoutTeardown on /goodbye, where there's no ProtectedRoute
    // / AuthProvider racing for the Supabase auth lock.
    expect(mockSignOutFromBrowser).not.toHaveBeenCalled();
  });

  it("passes through scope=global", () => {
    const { result } = renderHook(() => useLogout());

    result.current.signOut({ scope: "global" });

    expect(mockReplace).toHaveBeenCalledWith("/goodbye?scope=global");
  });

  it("honours a redirectTo override", () => {
    const { result } = renderHook(() => useLogout());

    result.current.signOut({ redirectTo: "/login" });

    expect(mockReplace).toHaveBeenCalledWith("/login?scope=local");
  });

  it("combines a redirectTo override with scope=global", () => {
    const { result } = renderHook(() => useLogout());

    result.current.signOut({ redirectTo: "/login", scope: "global" });

    expect(mockReplace).toHaveBeenCalledWith("/login?scope=global");
  });

  it("preserves an allowed fragment while adding the logout scope", () => {
    const { result } = renderHook(() => useLogout());

    result.current.signOut({ redirectTo: "/goodbye?source=menu#signed-out" });

    expect(mockReplace).toHaveBeenCalledWith("/goodbye?source=menu&scope=local#signed-out");
  });

  it.each(["https://evil.example/logout", "//evil.example/logout", "/%2f%2fevil.example"])(
    "falls back to /goodbye for unsafe override %s",
    (redirectTo) => {
      const { result } = renderHook(() => useLogout());

      result.current.signOut({ redirectTo });

      expect(mockReplace).toHaveBeenCalledWith("/goodbye?scope=local");
    },
  );
});

describe("useLogout.signOutOthers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSignOutFromBrowser.mockResolvedValue(undefined);
  });

  it("calls signOutFromBrowser with scope='others' and does NOT navigate", async () => {
    const { result } = renderHook(() => useLogout());

    await result.current.signOutOthers();

    expect(mockSignOutFromBrowser).toHaveBeenCalledTimes(1);
    expect(mockSignOutFromBrowser).toHaveBeenCalledWith("others");
    expect(mockReplace).not.toHaveBeenCalled();
    expect(mockBeginLogout).not.toHaveBeenCalled();
  });
});
