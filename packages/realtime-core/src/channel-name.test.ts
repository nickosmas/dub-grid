import { describe, expect, it } from "vitest";
import { createRealtimeChannelName } from "./channel-name";

describe("createRealtimeChannelName", () => {
  it("prefixes the given name", () => {
    expect(createRealtimeChannelName("org-freshness:org-1")).toMatch(/^org-freshness:org-1:/);
  });

  it("produces a different name on each call", () => {
    const first = createRealtimeChannelName("prefix");
    const second = createRealtimeChannelName("prefix");
    expect(first).not.toEqual(second);
  });
});
