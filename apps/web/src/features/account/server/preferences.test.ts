import { beforeEach, describe, expect, it, vi } from "vitest";

const stored = vi.fn();
const upsert = vi.fn();

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: () => stored() }) }),
      upsert: (...args: unknown[]) => upsert(...args),
    }),
  }),
}));

import { saveNotificationPreferences } from "./preferences";

const off = { in_app: false, email: false };
const on = { in_app: true, email: true };

describe("saveNotificationPreferences", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    upsert.mockResolvedValue({ error: null });
  });

  // Mobile knows three categories; its save used to erase the rest.
  it("keeps stored categories the save does not mention", async () => {
    stored.mockResolvedValue({ data: { prefs: { billing: off, schedule: on } }, error: null });

    const saved = await saveNotificationPreferences("user-1", { schedule: off, system: on });

    expect(saved).toEqual({ billing: off, schedule: off, system: on });
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: "user-1", prefs: saved }),
      { onConflict: "user_id" },
    );
  });

  it("never stores a security preference", async () => {
    stored.mockResolvedValue({ data: { prefs: { security: off } }, error: null });

    const saved = await saveNotificationPreferences("user-1", { schedule: on, security: off });

    expect(saved).toEqual({ schedule: on });
  });

  it("fails without writing when the stored map cannot be read", async () => {
    stored.mockResolvedValue({ data: null, error: new Error("read failed") });

    await expect(saveNotificationPreferences("user-1", { schedule: on })).rejects.toThrow(
      "read failed",
    );
    expect(upsert).not.toHaveBeenCalled();
  });
});
