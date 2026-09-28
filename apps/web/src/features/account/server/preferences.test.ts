import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({ rpc: (...args: unknown[]) => rpc(...args) }),
}));

import { saveNotificationPreferences } from "./preferences";

const off = { in_app: false, email: false };
const on = { in_app: true, email: true };

describe("saveNotificationPreferences", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Mobile knows three categories; its save used to erase the rest, and a
  // read-merge-write in the app could still lose a concurrent save (F-20).
  it("merges in the database and returns what is stored", async () => {
    rpc.mockResolvedValue({ data: { billing: off, schedule: off, system: on }, error: null });

    const saved = await saveNotificationPreferences("user-1", { schedule: off, system: on });

    expect(rpc).toHaveBeenCalledWith("merge_notification_preferences", {
      p_user_id: "user-1",
      p_prefs: { schedule: off, system: on },
    });
    expect(saved).toEqual({ billing: off, schedule: off, system: on });
  });

  it("fails when the merge fails", async () => {
    rpc.mockResolvedValue({ data: null, error: new Error("merge failed") });

    await expect(saveNotificationPreferences("user-1", { schedule: on })).rejects.toThrow(
      "merge failed",
    );
  });
});
