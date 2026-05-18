import { describe, it, expect, vi, beforeEach } from "vitest";
import { notify, notifyFromError } from "@/lib/notify";

// Mock sonner — capture every toast call.
const mockToast = {
  success: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  warning: vi.fn(),
  promise: vi.fn(),
  dismiss: vi.fn(),
};
vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => mockToast.success(...args),
    error: (...args: unknown[]) => mockToast.error(...args),
    info: (...args: unknown[]) => mockToast.info(...args),
    warning: (...args: unknown[]) => mockToast.warning(...args),
    promise: (...args: unknown[]) => mockToast.promise(...args),
    dismiss: (...args: unknown[]) => mockToast.dismiss(...args),
  },
}));

// Mock account client sign-out.
const mockSignOut = vi.fn().mockResolvedValue(undefined);
vi.mock("@/features/account/client", () => ({
  signOutFromBrowser: (...args: unknown[]) => mockSignOut(...args),
}));

// Mock window.location.replace. `configurable` keeps the property redefinable
// so sibling test files (e.g. error-handling.test.ts) can also stub it.
const mockReplace = vi.fn();
Object.defineProperty(window, "location", {
  value: { replace: mockReplace, href: "http://localhost" },
  writable: true,
  configurable: true,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

// ── tone helpers ─────────────────────────────────────────────────────────────

describe("notify tone helpers", () => {
  it("forwards title, description, and the per-tone default duration", () => {
    notify.success("Saved", { description: "Profile updated" });
    expect(mockToast.success).toHaveBeenCalledWith("Saved", {
      description: "Profile updated",
      id: undefined,
      duration: 4000,
      action: undefined,
    });
  });

  it("uses the error default duration", () => {
    notify.error("Boom");
    expect(mockToast.error).toHaveBeenCalledWith(
      "Boom",
      expect.objectContaining({ duration: 6000 }),
    );
  });

  it("lets callers override duration and pass a dedupe id", () => {
    notify.warning("Heads up", { id: "dupe", duration: Infinity });
    expect(mockToast.warning).toHaveBeenCalledWith(
      "Heads up",
      expect.objectContaining({ id: "dupe", duration: Infinity }),
    );
  });

  it("passes an action button through", () => {
    const onClick = vi.fn();
    notify.info("Stale", { action: { label: "Reload", onClick } });
    expect(mockToast.info).toHaveBeenCalledWith(
      "Stale",
      expect.objectContaining({ action: { label: "Reload", onClick } }),
    );
  });

  it("dismiss forwards the id", () => {
    notify.dismiss("session-expired");
    expect(mockToast.dismiss).toHaveBeenCalledWith("session-expired");
  });

  it("promise forwards the promise and messages", () => {
    const p = Promise.resolve(1);
    const messages = { loading: "…", success: "ok", error: "no" };
    notify.promise(p, messages);
    expect(mockToast.promise).toHaveBeenCalledWith(p, messages);
  });
});

// ── notifyFromError ──────────────────────────────────────────────────────────

describe("notifyFromError", () => {
  it("handles an expired session: persistent toast, sign-out, redirect", async () => {
    await notifyFromError(new Error("jwt expired"));
    expect(mockToast.error).toHaveBeenCalledWith(
      "Your session has expired",
      expect.objectContaining({ id: "session-expired", duration: Infinity }),
    );
    expect(mockSignOut).toHaveBeenCalledWith("local");
    expect(mockReplace).toHaveBeenCalledWith("/");
  });

  it("treats Refresh Token Not Found as an expired session", async () => {
    await notifyFromError(new Error("Refresh Token Not Found"));
    expect(mockSignOut).toHaveBeenCalledWith("local");
  });

  it("shows the connectivity message for Failed to fetch", async () => {
    await notifyFromError(new Error("Failed to fetch"));
    expect(mockToast.error).toHaveBeenCalledWith(
      "Check your internet connection and try again.",
      expect.objectContaining({ id: "network-error", duration: 8000 }),
    );
    expect(mockSignOut).not.toHaveBeenCalled();
  });

  it("treats a TypeError as a network error", async () => {
    const err = new TypeError("NetworkError when attempting to fetch resource");
    await notifyFromError(err);
    expect(mockToast.error).toHaveBeenCalledWith(
      "Check your internet connection and try again.",
      expect.objectContaining({ id: "network-error" }),
    );
  });

  it("builds a contextual title and dedupe id from the action verb", async () => {
    await notifyFromError(new Error("something odd happened"), {
      action: "save employee",
    });
    expect(mockToast.error).toHaveBeenCalledWith(
      "Couldn't save employee",
      expect.objectContaining({ id: "error-save-employee", duration: 6000 }),
    );
  });

  it("falls back to a generic title and id without an action", async () => {
    await notifyFromError(new Error("mystery"));
    expect(mockToast.error).toHaveBeenCalledWith(
      "Something went wrong",
      expect.objectContaining({ id: "generic-error" }),
    );
  });

  it("surfaces a friendly translated message as the description", async () => {
    await notifyFromError(new Error("invalid login credentials"), {
      action: "sign in",
    });
    expect(mockToast.error).toHaveBeenCalledWith(
      "Couldn't sign in",
      expect.objectContaining({
        description: "Check your email and password and try again.",
      }),
    );
  });

  it("uses the provided fallback when the error can't be translated", async () => {
    await notifyFromError(new Error("PGRST204 schema cache miss"), {
      action: "load shifts",
      fallback: "We couldn't load the schedule.",
    });
    expect(mockToast.error).toHaveBeenCalledWith(
      "Couldn't load shifts",
      expect.objectContaining({
        description: "We couldn't load the schedule.",
      }),
    );
  });
});
