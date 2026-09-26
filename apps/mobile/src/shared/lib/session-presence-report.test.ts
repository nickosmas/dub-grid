import { describe, expect, it, vi } from "vitest";
import { reportSessionPresence } from "./session-presence-report";

const sleep = vi.fn(async () => undefined);
const refused = (status?: number) => Object.assign(new Error("refused"), { status });

describe("reportSessionPresence", () => {
  it("retries a refused report and resolves once it lands", async () => {
    const send = vi.fn().mockRejectedValueOnce(refused(409)).mockResolvedValueOnce({});

    await expect(
      reportSessionPresence("token", { send, isCurrent: () => true, sleep }),
    ).resolves.toBe(true);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("gives up after three attempts", async () => {
    const send = vi.fn().mockRejectedValue(refused());

    await expect(
      reportSessionPresence("token", { send, isCurrent: () => true, sleep }),
    ).resolves.toBe(false);
    expect(send).toHaveBeenCalledTimes(3);
  });

  it("does not retry a refusal that would repeat", async () => {
    const send = vi.fn().mockRejectedValue(refused(401));

    await expect(
      reportSessionPresence("token", { send, isCurrent: () => true, sleep }),
    ).resolves.toBe(false);
    expect(send).toHaveBeenCalledOnce();
  });

  it("stops once another token has taken over", async () => {
    const send = vi.fn().mockRejectedValue(refused(500));

    await expect(
      reportSessionPresence("token", { send, isCurrent: () => false, sleep }),
    ).resolves.toBe(false);
    expect(send).toHaveBeenCalledOnce();
  });
});
