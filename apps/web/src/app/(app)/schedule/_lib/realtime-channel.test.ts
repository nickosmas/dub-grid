import { describe, expect, it } from "vitest";
import { getScheduleRealtimeChannelOptions } from "./realtime-channel";

describe("getScheduleRealtimeChannelOptions", () => {
  it("uses an acknowledged private channel with presence keyed per editor session", () => {
    expect(getScheduleRealtimeChannelOptions("editor-session-1")).toEqual({
      config: {
        private: true,
        broadcast: { ack: true },
        presence: { key: "editor-session-1" },
      },
    });
  });
});
