import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createNetworkErrorToast,
  getClientFriendlyErrorMessage,
  getInlineErrorMessageOrToast,
  getOrgUnavailableMessage,
  isNetworkConnectionError,
} from "./errors";

describe("mobile error helpers", () => {
  beforeEach(() => {
    vi.stubEnv("EXPO_PUBLIC_SUPABASE_URL", "https://example-project.supabase.co");
    vi.stubEnv("EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "anon-key");
    vi.stubEnv("EXPO_PUBLIC_API_BASE_URL", "https://app.dubgrid.com");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("maps auth messages to client-friendly copy", () => {
    expect(
      getClientFriendlyErrorMessage(new Error("Invalid login credentials"), "Fallback message"),
    ).toBe("Check your email and password and try again.");
  });

  it("maps duplicate open-shift volunteering to client-friendly copy", () => {
    expect(
      getClientFriendlyErrorMessage(
        new Error("You already volunteered for this open shift"),
        "Fallback message",
      ),
    ).toBe("You already volunteered for this open shift.");
  });

  it("maps invitation email delivery failures to client-friendly copy", () => {
    expect(
      getClientFriendlyErrorMessage(
        new Error("Invitation email could not be sent. Try again in a moment."),
        "Fallback message",
      ),
    ).toBe("We couldn't send that email. Please try again shortly.");
  });

  it("detects network connection errors", () => {
    expect(
      isNetworkConnectionError(
        new Error("We couldn't reach the mobile backend at https://dubgrid.com"),
      ),
    ).toBe(true);
  });

  it("preserves organization unavailable messages for mobile gates and login errors", () => {
    const error = new Error(
      "Organization unavailable. Sign in on the web to finish organization setup.",
    );

    expect(getOrgUnavailableMessage(error)).toBe(
      "Organization unavailable. Sign in on the web to finish organization setup.",
    );
    expect(getClientFriendlyErrorMessage(error, "Fallback message")).toBe(
      "Organization unavailable. Sign in on the web to finish organization setup.",
    );
  });

  it("uses a persistent network toast instead of inline copy", () => {
    const pushToast = vi.fn();

    const result = getInlineErrorMessageOrToast(pushToast, {
      error: new Error("Network request failed"),
      fallbackMessage: "Fallback message",
    });

    expect(result).toBeNull();
    expect(pushToast).toHaveBeenCalledWith(createNetworkErrorToast());
  });

  it("uses client-friendly inline copy for startup network errors", () => {
    const pushToast = vi.fn();
    const message =
      "We couldn't reach the mobile backend at http://192.168.1.181:3000. Check EXPO_PUBLIC_API_BASE_URL in apps/mobile/.env.local.";

    const result = getInlineErrorMessageOrToast(pushToast, {
      error: new Error(message),
      fallbackMessage: "Fallback message",
      preferInlineNetworkError: true,
    });

    expect(result).toBe(
      "We couldn't connect to DubGrid from this device. Check your internet connection and try again.",
    );
    expect(pushToast).not.toHaveBeenCalled();
  });

  it("hints at the same-Wi-Fi requirement when the API base URL is a LAN IP", () => {
    vi.stubEnv("EXPO_PUBLIC_API_BASE_URL", "http://192.168.1.181:3000");
    const pushToast = vi.fn();

    const result = getInlineErrorMessageOrToast(pushToast, {
      error: new Error("Network request failed"),
      fallbackMessage: "Fallback message",
      preferInlineNetworkError: true,
    });

    expect(result).toBe(
      "We couldn't reach DubGrid from this device. Make sure your phone is on the same Wi-Fi network as the laptop running the dev server, then try again.",
    );
    expect(pushToast).not.toHaveBeenCalled();
  });
});
