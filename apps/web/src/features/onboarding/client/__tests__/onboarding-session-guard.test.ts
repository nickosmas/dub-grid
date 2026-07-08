import { beforeEach, describe, expect, it } from "vitest";
import {
  markOnboardingComplete,
  isOnboardingComplete,
  getOnboardingPhase,
  freezeOnboardingPhase,
  clearOnboardingPhase,
} from "@/features/onboarding/client";

beforeEach(() => {
  sessionStorage.clear();
});

describe("onboarding same-session completion guard", () => {
  it("reports not-complete until marked", () => {
    expect(isOnboardingComplete("u-1", "org-1")).toBe(false);
    markOnboardingComplete("u-1", "org-1");
    expect(isOnboardingComplete("u-1", "org-1")).toBe(true);
  });

  it("is scoped per user + org", () => {
    markOnboardingComplete("u-1", "org-1");
    // Same user, different org — not complete.
    expect(isOnboardingComplete("u-1", "org-2")).toBe(false);
    // Different user, same org — not complete.
    expect(isOnboardingComplete("u-2", "org-1")).toBe(false);
    // The exact pair that was marked — complete.
    expect(isOnboardingComplete("u-1", "org-1")).toBe(true);
  });
});

describe("onboarding same-session phase freeze", () => {
  it("freezes the first phase and ignores later flips (config stays config)", () => {
    expect(getOnboardingPhase("u-1", "org-1")).toBeNull();
    // Org incomplete at first wizard render → config.
    freezeOnboardingPhase("u-1", "org-1", "config");
    expect(getOnboardingPhase("u-1", "org-1")).toBe("config");
    // Setup completes mid-flow → a later freeze attempt must NOT swap it.
    freezeOnboardingPhase("u-1", "org-1", "orientation");
    expect(getOnboardingPhase("u-1", "org-1")).toBe("config");
  });

  it("clears on completion so the next session can re-decide", () => {
    freezeOnboardingPhase("u-1", "org-1", "orientation");
    expect(getOnboardingPhase("u-1", "org-1")).toBe("orientation");
    clearOnboardingPhase("u-1", "org-1");
    expect(getOnboardingPhase("u-1", "org-1")).toBeNull();
  });
});
