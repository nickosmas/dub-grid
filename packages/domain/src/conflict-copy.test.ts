import { describe, expect, it } from "vitest";
import { changedElsewhereMessage } from "./conflict-copy";

describe("changedElsewhereMessage", () => {
  it("names what changed and what to do", () => {
    expect(changedElsewhereMessage("their status")).toBe(
      "Someone else just changed their status. Refresh and try again.",
    );
  });
});
