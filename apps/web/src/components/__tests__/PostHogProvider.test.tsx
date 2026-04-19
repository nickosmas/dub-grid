import { act, render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

let consentGranted = false;
const consentListeners = new Set<() => void>();
let currentUser: { id: string; email: string } | null = null;

const enablePostHog = vi.fn();
const disablePostHog = vi.fn();
const identifyUser = vi.fn();
const resetPostHog = vi.fn();

vi.mock("@/components/AuthProvider", () => ({
  useAuth: () => ({ user: currentUser }),
}));

vi.mock("@/components/CookieConsent", () => ({
  subscribeToConsentChanges: (callback: () => void) => {
    consentListeners.add(callback);
    return () => consentListeners.delete(callback);
  },
  getAnalyticsConsentSnapshot: () => consentGranted,
}));

vi.mock("@/lib/posthog", () => ({
  enablePostHog: (...args: unknown[]) => enablePostHog(...args),
  disablePostHog: (...args: unknown[]) => disablePostHog(...args),
  identifyUser: (...args: unknown[]) => identifyUser(...args),
  resetPostHog: (...args: unknown[]) => resetPostHog(...args),
}));

import PostHogProvider from "@/components/PostHogProvider";

function notifyConsentChanged() {
  for (const callback of consentListeners) {
    callback();
  }
}

describe("PostHogProvider", () => {
  beforeEach(() => {
    consentGranted = false;
    currentUser = null;
    consentListeners.clear();
    vi.clearAllMocks();
  });

  it("initializes and identifies only after analytics consent is granted", async () => {
    currentUser = { id: "user-1", email: "user@example.com" };
    render(
      <PostHogProvider>
        <div>child</div>
      </PostHogProvider>,
    );

    expect(disablePostHog).toHaveBeenCalledTimes(1);
    expect(enablePostHog).not.toHaveBeenCalled();
    expect(identifyUser).not.toHaveBeenCalled();

    consentGranted = true;
    act(() => {
      notifyConsentChanged();
    });

    await waitFor(() => {
      expect(enablePostHog).toHaveBeenCalledTimes(1);
      expect(identifyUser).toHaveBeenCalledWith("user-1", {
        email: "user@example.com",
      });
    });
  });

  it("fully disables analytics again when consent is revoked", async () => {
    consentGranted = true;
    currentUser = { id: "user-2", email: "revoked@example.com" };

    render(
      <PostHogProvider>
        <div>child</div>
      </PostHogProvider>,
    );

    await waitFor(() => {
      expect(enablePostHog).toHaveBeenCalledTimes(1);
      expect(identifyUser).toHaveBeenCalledWith("user-2", {
        email: "revoked@example.com",
      });
    });

    consentGranted = false;
    act(() => {
      notifyConsentChanged();
    });

    await waitFor(() => {
      expect(disablePostHog).toHaveBeenCalledTimes(1);
    });
  });
});
