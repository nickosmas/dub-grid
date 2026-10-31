import { beforeEach, describe, expect, it, vi } from "vitest";

const getSession = vi.fn();
const getBootstrap = vi.fn();
const getStoredValue = vi.fn();

vi.mock("../../../shared/lib/supabase", () => ({
  getSupabaseClient: () => ({ auth: { getSession } }),
}));
vi.mock("../../../shared/lib/api", () => ({ getBootstrap }));
vi.mock("../../../shared/lib/local-storage", () => ({
  getStoredValue: (key: string) => getStoredValue(key),
  setStoredValue: vi.fn(),
}));

const { queryClient } = await import("../../../shared/lib/query-client");
const { buildBootstrapQueryKey } = await import("../hooks/useBootstrap");
const { loadThemePreference } = await import("../../../shared/lib/theme-preference");
const { getStartupBeganAt, warmStartup } = await import("./warm-startup");

function tokenFor(sub: string, orgId: string): string {
  const encode = (value: object) => btoa(JSON.stringify(value)).replace(/=+$/, "");
  return `${encode({ alg: "none" })}.${encode({ sub, org_id: orgId })}.sig`;
}

describe("warmStartup", () => {
  beforeEach(async () => {
    queryClient.clear();
    getSession.mockReset();
    getBootstrap.mockReset();
    getStoredValue.mockReset().mockResolvedValue(null);
    // Takes any read an earlier case started, so each case starts with none.
    await loadThemePreference();
    getStoredValue.mockClear();
  });

  it("starts the bootstrap for the stored session under the key the splash reads", async () => {
    const accessToken = tokenFor("user-1", "org-1");
    getSession.mockResolvedValue({ data: { session: { access_token: accessToken } } });
    getBootstrap.mockResolvedValue({ currentOrg: { id: "org-1" } });
    getStoredValue.mockResolvedValue(null);

    warmStartup();

    await vi.waitFor(() =>
      expect(getBootstrap).toHaveBeenCalledWith(accessToken, expect.anything()),
    );
    await vi.waitFor(() =>
      expect(queryClient.getQueryData(buildBootstrapQueryKey(accessToken))).toEqual({
        currentOrg: { id: "org-1" },
      }),
    );
    expect(getStartupBeganAt()).not.toBeNull();
  });

  it("asks for nothing when no one is signed in", async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    getStoredValue.mockResolvedValue(null);

    warmStartup();
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(getBootstrap).not.toHaveBeenCalled();
  });

  it("hands the theme read it started to the first load, once", async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    getStoredValue.mockResolvedValue("dark");

    warmStartup();

    await expect(loadThemePreference()).resolves.toBe("dark");
    expect(getStoredValue).toHaveBeenCalledTimes(1);
    await loadThemePreference();
    expect(getStoredValue).toHaveBeenCalledTimes(2);
  });
});
