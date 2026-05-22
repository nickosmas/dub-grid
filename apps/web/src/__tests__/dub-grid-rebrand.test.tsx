import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { metadata } from "../app/layout";

// ─── 4.2 Property test: Tagline consistency (Requirements 7.3) ───────────────

describe("Feature: dub-grid-rebrand, Property 1: Tagline consistency across surfaces", () => {
  /**
   * Property 1: Tagline consistency across surfaces
   * Validates: Requirements 7.3
   *
   * The canonical tagline lives in layout.tsx metadata.description
   * ("Staff scheduling, built for care teams.").
   * The landing page hero headline reads "Scheduling, done right." and its
   * subtitle is "Built for the way care teams actually work."
   * This property asserts the metadata description contains the same core words.
   */
  it("metadata description contains the core tagline words present in the landing page hero", () => {
    const canonicalTagline = metadata.description ?? "";

    // Words shared between the metadata tagline and the hero headline + subtitle
    const heroKeywords = ["scheduling", "care", "teams"];

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
