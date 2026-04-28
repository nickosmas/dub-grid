import { describe, expect, it, vi } from "vitest";
import {
  createNetworkErrorToast,
  getClientFriendlyErrorMessage,
  getInlineErrorMessageOrToast,
  isNetworkConnectionError,
} from "./errors";

describe("mobile error helpers", () => {
  it("maps auth messages to client-friendly copy", () => {
    expect(
      getClientFriendlyErrorMessage(
        new Error("Invalid login credentials"),
        "Fallback message",
      ),
    ).toBe("Check your email and password and try again.");
  });

  it("detects network connection errors", () => {
    expect(
      isNetworkConnectionError(
        new Error("We couldn't reach the mobile backend at https://dubgrid.com"),
      ),
    ).toBe(true);
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
});
