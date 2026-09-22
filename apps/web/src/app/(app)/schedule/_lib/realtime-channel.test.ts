import { describe, expect, it } from "vitest";
import {
  canJoinScheduleDraftsChannel,
  getScheduleChannelName,
  getScheduleDraftsChannelName,
  getScheduleDraftsChannelOptions,
  getScheduleRealtimeChannelOptions,
} from "./realtime-channel";

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

describe("schedule draft topic", () => {
  it("derives the editor topic from the shared one, matching the migration 035 policy", () => {
    expect(getScheduleChannelName("org-1")).toBe("schedule:org-1");
    expect(getScheduleDraftsChannelName("org-1")).toBe("schedule:org-1:drafts");
  });

  it("is a private acknowledged channel without presence", () => {
    expect(getScheduleDraftsChannelOptions()).toEqual({
      config: { private: true, broadcast: { ack: true } },
    });
  });

  it("is joined by shift and note editors only", () => {
    expect(canJoinScheduleDraftsChannel({ canEditShifts: true, canEditNotes: false })).toBe(true);
    expect(canJoinScheduleDraftsChannel({ canEditShifts: false, canEditNotes: true })).toBe(true);
    expect(canJoinScheduleDraftsChannel({ canEditShifts: false, canEditNotes: false })).toBe(false);
  });
});
