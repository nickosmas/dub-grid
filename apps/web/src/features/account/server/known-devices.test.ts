import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const upsert = vi.fn();
const upsertSelect = vi.fn();
const update = vi.fn();
const updateEqUser = vi.fn();
const updateEqDevice = vi.fn();
const warn = vi.fn();

vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({
    from: (table: string) => {
      expect(table).toBe("user_known_devices");
      return {
        upsert: (...args: unknown[]) => {
          upsert(...args);
          return { select: (...cols: unknown[]) => upsertSelect(...cols) };
        },
        update: (...args: unknown[]) => {
          update(...args);
          return {
            eq: (...first: unknown[]) => {
              updateEqUser(...first);
              return { eq: (...second: unknown[]) => updateEqDevice(...second) };
            },
          };
        },
      };
    },
  }),
}));

vi.mock("@/lib/logger", () => ({ default: { warn: (...args: unknown[]) => warn(...args) } }));

import { readDeviceId, rememberSignInDevice } from "./known-devices";

const DEVICE = "6f1c2d3e-4b5a-4c6d-8e7f-9a0b1c2d3e4f";
const DEVICE_HASH = createHash("sha256").update(DEVICE).digest("hex");

describe("rememberSignInDevice", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updateEqDevice.mockResolvedValue({ error: null });
  });

  it("records a device the user has never signed in from, and calls it new", async () => {
    upsertSelect.mockResolvedValue({ data: [{ user_id: "user-1" }], error: null });

    await expect(
      rememberSignInDevice({ userId: "user-1", deviceId: DEVICE, platform: "web" }),
    ).resolves.toBe(true);

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: "user-1", device_hash: DEVICE_HASH, platform: "web" }),
      { onConflict: "user_id,device_hash", ignoreDuplicates: true },
    );
    expect(update).not.toHaveBeenCalled();
  });

  it("stores only a hash of the device id", async () => {
    upsertSelect.mockResolvedValue({ data: [{ user_id: "user-1" }], error: null });

    await rememberSignInDevice({ userId: "user-1", deviceId: DEVICE, platform: "ios" });

    expect(JSON.stringify(upsert.mock.calls)).not.toContain(DEVICE);
  });

  it("touches a known device and calls it known", async () => {
    upsertSelect.mockResolvedValue({ data: [], error: null });

    await expect(
      rememberSignInDevice({ userId: "user-1", deviceId: DEVICE, platform: "web" }),
    ).resolves.toBe(false);

    expect(update).toHaveBeenCalledWith({ last_seen_at: expect.any(String) });
    expect(updateEqUser).toHaveBeenCalledWith("user_id", "user-1");
    expect(updateEqDevice).toHaveBeenCalledWith("device_hash", DEVICE_HASH);
  });

  it("calls a device new when the lookup fails, so the alert is not lost", async () => {
    upsertSelect.mockResolvedValue({ data: null, error: { message: "relation does not exist" } });

    await expect(
      rememberSignInDevice({ userId: "user-1", deviceId: DEVICE, platform: "android" }),
    ).resolves.toBe(true);
    expect(warn).toHaveBeenCalledTimes(1);
  });
});

describe("readDeviceId", () => {
  it("accepts an issued id and rejects anything else", () => {
    expect(readDeviceId(DEVICE)).toBe(DEVICE);
    expect(readDeviceId(DEVICE.toUpperCase())).toBe(DEVICE);
    expect(readDeviceId("not-an-id")).toBeNull();
    expect(readDeviceId("")).toBeNull();
    expect(readDeviceId(undefined)).toBeNull();
  });
});
