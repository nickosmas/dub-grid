import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isMobileOrgSetupComplete, resetMobileOrgSetupCompleteMemo } from "./setup";

const ORG_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

function buildServiceClient(state: { complete: boolean }) {
  const from = vi.fn((table: string) => {
    const complete = state.complete;
    const rows: Record<string, { data: unknown[]; count?: number }> = {
      focus_areas: { data: complete ? [{ id: 1, department_id: 10, archived_at: null }] : [] },
      shift_categories: { data: complete ? [{ id: 2, focus_area_id: 1, archived_at: null }] : [] },
      jobs: {
        data: complete
          ? [{ assignment_mode: "shiftless", show_on_grid: true, archived_at: null }]
          : [],
      },
      certifications: { data: complete ? [{ id: 4, archived_at: null }] : [] },
      organization_roles: { data: complete ? [{ id: 5, archived_at: null }] : [] },
      departments: { data: complete ? [{ id: 10, type: "scheduled", archived_at: null }] : [] },
      employees: { data: [], count: complete ? 1 : 0 },
    };
    const result = { error: null, ...rows[table] };
    const chain = {
      select: () => chain,
      eq: () => chain,
      is: () => chain,
      then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
        Promise.resolve(result).then(resolve, reject),
    };
    return chain;
  });
  return { client: { from } as unknown as SupabaseClient, from };
}

describe("isMobileOrgSetupComplete memo", () => {
  beforeEach(() => {
    resetMobileOrgSetupCompleteMemo();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("answers a complete organization from memory for a minute", async () => {
    const state = { complete: true };
    const { client, from } = buildServiceClient(state);

    expect(await isMobileOrgSetupComplete(client, ORG_ID)).toBe(true);
    const readsForOneCheck = from.mock.calls.length;
    expect(readsForOneCheck).toBe(7);

    state.complete = false;
    vi.advanceTimersByTime(59_000);
    expect(await isMobileOrgSetupComplete(client, ORG_ID)).toBe(true);
    expect(from).toHaveBeenCalledTimes(readsForOneCheck);

    vi.advanceTimersByTime(2_000);
    expect(await isMobileOrgSetupComplete(client, ORG_ID)).toBe(false);
    expect(from).toHaveBeenCalledTimes(readsForOneCheck * 2);
  });

  // Incomplete to complete is what an admin finishing setup is waiting on.
  it("never remembers an incomplete organization", async () => {
    const state = { complete: false };
    const { client, from } = buildServiceClient(state);

    expect(await isMobileOrgSetupComplete(client, ORG_ID)).toBe(false);
    state.complete = true;
    expect(await isMobileOrgSetupComplete(client, ORG_ID)).toBe(true);
    expect(from).toHaveBeenCalledTimes(14);
  });

  it("shares one read between checks that arrive together", async () => {
    const { client, from } = buildServiceClient({ complete: false });

    const answers = await Promise.all([
      isMobileOrgSetupComplete(client, ORG_ID),
      isMobileOrgSetupComplete(client, ORG_ID),
    ]);

    expect(answers).toEqual([false, false]);
    expect(from).toHaveBeenCalledTimes(7);
  });

  it("remembers each organization on its own", async () => {
    const { client, from } = buildServiceClient({ complete: true });

    await isMobileOrgSetupComplete(client, ORG_ID);
    await isMobileOrgSetupComplete(client, "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");
    expect(from).toHaveBeenCalledTimes(14);
  });
});
