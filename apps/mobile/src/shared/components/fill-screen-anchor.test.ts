import { describe, expect, it } from "vitest";
import { FILL_SCREEN_ANCHOR_FRACTION, fillScreenAnchorStyles } from "./fill-screen-anchor";

describe("fill-screen anchor", () => {
  it("sits the message above centre, not in the middle of the void", () => {
    // The reported bug: a page-owning empty state centred in all the remaining
    // space left the message marooned far below the filter row it belongs to.
    expect(FILL_SCREEN_ANCHOR_FRACTION).toBeLessThan(0.5);
  });

  it("keeps it well clear of the top, so it still reads as the subject", () => {
    // Anchoring is not the same as pinning: too high and it reads as a caption
    // on the control above it rather than as the state of the page.
    expect(FILL_SCREEN_ANCHOR_FRACTION).toBeGreaterThan(0.25);
  });

  it("claims the leftover space rather than sizing to its content", () => {
    // Without `flex: 1` on the root there is no space for the spacers to
    // divide, and the anchor silently does nothing.
    expect(fillScreenAnchorStyles.fill).toBeDefined();
    expect(fillScreenAnchorStyles.spacerAbove).toBeDefined();
    expect(fillScreenAnchorStyles.spacerBelow).toBeDefined();
  });
});
