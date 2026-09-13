import { beforeEach, describe, expect, it } from "vitest";
import {
  clearBrowserRecoveryVerification,
  consumeBrowserRecoveryVerification,
  markBrowserRecoveryVerified,
} from "./browser-recovery-capability";

describe("browser recovery capability", () => {
  beforeEach(() => window.sessionStorage.clear());

  it("is absent for an ordinary signed-in session", () => {
    expect(consumeBrowserRecoveryVerification()).toBe(false);
  });

  it("is consumed once after recovery verification", () => {
    markBrowserRecoveryVerified();
    expect(consumeBrowserRecoveryVerification()).toBe(true);
    expect(consumeBrowserRecoveryVerification()).toBe(false);
  });

  it("can be cleared after terminal failure", () => {
    markBrowserRecoveryVerified();
    clearBrowserRecoveryVerification();
    expect(consumeBrowserRecoveryVerification()).toBe(false);
  });
});
