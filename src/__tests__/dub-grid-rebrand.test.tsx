import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { metadata } from "../app/layout";

// ─── 4.2 Property test: Tagline consistency (Requirements 7.3) ───────────────

describe("Feature: dub-grid-rebrand, Property 1: Tagline consistency across surfaces", () => {
  /**
   * Property 1: Tagline consistency across surfaces
   * Validates: Requirements 7.3
   *
   * The canonical tagline lives in layout.tsx metadata.description.
   * The landing page hero renders "Smart Staff" and "Scheduling" as separate spans.
   * This property asserts the metadata description contains the same core words.
   */
  it("metadata description contains the core tagline words present in the landing page hero", () => {
    const canonicalTagline = metadata.description ?? "";

    // The hero renders "Smart Staff" (plain text) and "Scheduling" (in a <span>)
    const heroKeywords = ["Smart", "Staff", "Scheduling"];

    fc.assert(
      fc.property(fc.constant(canonicalTagline), (tagline) => {
        for (const word of heroKeywords) {
          expect(tagline.toLowerCase()).toContain(word.toLowerCase());
        }
      }),
      { numRuns: 1 },
    );
  });
});
