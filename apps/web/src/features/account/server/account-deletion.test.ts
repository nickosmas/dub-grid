import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

const revokeAllUserSessions = vi.fn();
const captureException = vi.fn();

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/revocation", () => ({
  revokeAllUserSessions: (...args: unknown[]) => revokeAllUserSessions(...args),
}));
vi.mock("@/lib/sentry", () => ({
  captureException: (...args: unknown[]) => captureException(...args),
}));
vi.mock("@/lib/logger", () => ({ default: { error: vi.fn(), info: vi.fn() } }));

import { deleteUserAccountWithCleanup, rejectDeletedAccountTokens } from "./account-deletion";

const USER_ID = "22222222-2222-4222-8222-222222222222";

// Every table read or write resolves empty, which is a member of no
// organization: nothing blocks the deletion.
function makeClient(deleteError: unknown = null) {
  const chain: Record<string, unknown> = {};
  for (const method of ["select", "eq", "is", "delete", "update", "insert"]) {
    chain[method] = vi.fn(() => chain);
  }
  chain.single = vi.fn().mockResolvedValue({ data: { platform_role: "none" }, error: null });
  chain.then = (resolve: (value: unknown) => unknown) => resolve({ data: [], error: null });
  const deleteUser = vi.fn().mockResolvedValue({ error: deleteError });
  const client = {
    from: vi.fn(() => chain),
    auth: {
      admin: {
        getUserById: vi.fn().mockResolvedValue({ data: { user: { email: "u@test.com" } } }),
        deleteUser,
      },
    },
  } as unknown as SupabaseClient;
  return { client, deleteUser };
}

function run(client: SupabaseClient) {
  return deleteUserAccountWithCleanup({
    serviceClient: client,
    userId: USER_ID,
    actorId: "approver",
    actorEmail: "approver@test.com",
    reason: "admin_approved_request",
  });
}

describe("rejectDeletedAccountTokens", () => {
  beforeEach(() => vi.clearAllMocks());

  // The watermark write swallows its own failures; the session-row delete is
  // what can reject.
  it("reports a failure instead of failing a deletion that already happened", async () => {
    revokeAllUserSessions.mockRejectedValueOnce(new Error("database unavailable"));

    await expect(rejectDeletedAccountTokens(USER_ID, "test")).resolves.toBeUndefined();
    expect(captureException).toHaveBeenCalledWith(expect.any(Error), {
      extra: { userId: USER_ID, context: "test" },
    });
  });
});

describe("deleteUserAccountWithCleanup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    revokeAllUserSessions.mockResolvedValue(undefined);
  });

  // An administrator-approved deletion ends the sign-in; web would otherwise
  // accept its issued tokens for up to an hour (41b1).
  it("rejects the deleted account's tokens once the account is gone", async () => {
    const { client, deleteUser } = makeClient();

    await run(client);

    expect(revokeAllUserSessions).toHaveBeenCalledWith(USER_ID);
    expect(deleteUser.mock.invocationCallOrder[0]).toBeLessThan(
      revokeAllUserSessions.mock.invocationCallOrder[0],
    );
  });

  it("leaves the tokens alone when the account could not be deleted", async () => {
    const { client } = makeClient(new Error("auth down"));

    await expect(run(client)).rejects.toThrow("auth down");
    expect(revokeAllUserSessions).not.toHaveBeenCalled();
  });
});
