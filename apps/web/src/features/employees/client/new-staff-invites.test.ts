import { describe, expect, it, vi } from "vitest";
import { sendNewStaffInvites, type NewStaffInvite } from "./new-staff-invites";

vi.mock("@/features/account/client/step-up", () => ({
  getStepUpMethod: (failure: unknown) =>
    failure instanceof Error && failure.message === "step-up" ? "password" : null,
}));

const added = [
  { id: "e1", email: "jane@calmhaven.org" },
  { id: "e2", email: "Omar@calmhaven.org" },
  { id: "e3", email: "" },
];

function pendingOf(...invites: NewStaffInvite[]) {
  return new Map(invites.map((invite) => [invite.email.toLowerCase(), invite]));
}

describe("sendNewStaffInvites", () => {
  it("invites each added person by their address with the level picked", async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const pending = pendingOf(
      { email: "jane@calmhaven.org", role: "admin" },
      { email: "omar@calmhaven.org", role: "user" },
    );
    const failed: string[] = [];

    await sendNewStaffInvites({ added, pending, failed, send });

    expect(send.mock.calls.map(([call]) => call)).toEqual([
      { email: "jane@calmhaven.org", role: "admin", employeeId: "e1" },
      { email: "Omar@calmhaven.org", role: "user", employeeId: "e2" },
    ]);
    expect(pending.size).toBe(0);
    expect(failed).toEqual([]);
  });

  it("skips anyone who wasn't added and collects a failed send", async () => {
    const send = vi.fn().mockRejectedValueOnce(new Error("rate limited"));
    const pending = pendingOf(
      { email: "jane@calmhaven.org", role: "user" },
      { email: "lena@calmhaven.org", role: "user" },
    );
    const failed: string[] = [];

    await sendNewStaffInvites({ added, pending, failed, send });

    expect(send).toHaveBeenCalledTimes(1);
    expect(failed).toEqual(["jane@calmhaven.org"]);
    expect(pending.size).toBe(0);
  });

  it("stops at an identity check and resumes without sending twice", async () => {
    const send = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("step-up"))
      .mockResolvedValue(undefined);
    const pending = pendingOf(
      { email: "jane@calmhaven.org", role: "user" },
      { email: "omar@calmhaven.org", role: "admin" },
    );
    const failed: string[] = [];

    await expect(sendNewStaffInvites({ added, pending, failed, send })).rejects.toThrow("step-up");
    expect([...pending.keys()]).toEqual(["omar@calmhaven.org"]);

    await sendNewStaffInvites({ added, pending, failed, send });
    expect(send.mock.calls.map(([call]) => call.employeeId)).toEqual(["e1", "e2", "e2"]);
    expect(pending.size).toBe(0);
  });
});
