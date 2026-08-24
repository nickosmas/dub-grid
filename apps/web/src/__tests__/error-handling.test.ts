import { describe, it, expect, vi, beforeEach } from "vitest";
import { extractErrorMessage, handleApiError } from "@/lib/error-handling";

// Mock sonner toast
const mockToastError = vi.fn();
vi.mock("sonner", () => ({
  toast: { error: (...args: unknown[]) => mockToastError(...args) },
}));

// Mock account client auth
const mockSignOut = vi.fn().mockResolvedValue({});
vi.mock("@/features/account/client", () => ({
  signOutFromBrowser: (...args: unknown[]) => mockSignOut(...args),
}));

// Mock window.location.replace
const mockReplace = vi.fn();
Object.defineProperty(window, "location", {
  value: { replace: mockReplace, href: "http://localhost" },
  writable: true,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

// ── extractErrorMessage ──────────────────────────────────────────────────────

describe("extractErrorMessage", () => {
  it("extracts message from Error instance", () => {
    expect(extractErrorMessage(new Error("boom"), "fallback")).toBe("boom");
  });

  it("extracts message from object with message property", () => {
    expect(extractErrorMessage({ message: "obj error" }, "fallback")).toBe("obj error");
  });

  it("returns fallback for object with non-string message", () => {
    expect(extractErrorMessage({ message: 42 }, "fallback")).toBe("fallback");
  });

  it("returns plain string directly", () => {
    expect(extractErrorMessage("plain error", "fallback")).toBe("plain error");
  });

  it("returns fallback for null", () => {
    expect(extractErrorMessage(null, "fallback")).toBe("fallback");
  });

  it("returns fallback for undefined", () => {
    expect(extractErrorMessage(undefined, "fallback")).toBe("fallback");
  });
});

// ── handleApiError ───────────────────────────────────────────────────────────

describe("handleApiError", () => {
  it("handles jwt expired by showing toast, signing out, and redirecting", async () => {
    await handleApiError(new Error("jwt expired"));
    expect(mockToastError).toHaveBeenCalledWith(
      expect.stringContaining("session expired"),
      expect.any(Object),
    );
    expect(mockSignOut).toHaveBeenCalledWith("local");
    expect(mockReplace).toHaveBeenCalledWith("/");
  });

  it("handles Refresh Token Not Found the same way", async () => {
    await handleApiError(new Error("Refresh Token Not Found"));
    expect(mockToastError).toHaveBeenCalledWith(
      expect.stringContaining("session expired"),
      expect.any(Object),
    );
    expect(mockSignOut).toHaveBeenCalled();
  });

  it("handles Invalid Refresh Token the same way", async () => {
    await handleApiError(new Error("Invalid Refresh Token"));
    expect(mockSignOut).toHaveBeenCalled();
  });

  it("handles this app's own 401 session-expiry body text the same way", async () => {
    // Regression: a stale in-flight request hitting api-auth.ts's own 401
    // ("Your session expired. Sign in again.") used to slip past the
    // exact-cased Supabase-string check above and fall through to the generic
    // "Something went wrong: ..." toast instead of signing out and
    // redirecting — most visible right after logging into a different
    // account while a query from the previous session was still in flight.
    await handleApiError(new Error("Your session expired. Sign in again."));
    expect(mockToastError).toHaveBeenCalledWith(
      expect.stringContaining("session expired"),
      expect.any(Object),
    );
    expect(mockSignOut).toHaveBeenCalledWith("local");
    expect(mockReplace).toHaveBeenCalledWith("/");
  });

  it("handles Failed to fetch with connectivity toast", async () => {
    await handleApiError(new Error("Failed to fetch"));
    expect(mockToastError).toHaveBeenCalledWith(
      expect.stringContaining("trouble connecting"),
      expect.any(Object),
    );
    expect(mockSignOut).not.toHaveBeenCalled();
  });

  it("handles generic error with 'Something went wrong' toast", async () => {
    await handleApiError(new Error("some unknown error"));
    expect(mockToastError).toHaveBeenCalledWith(
      expect.stringContaining("Something went wrong"),
      expect.any(Object),
    );
  });

  it("includes action context when provided", async () => {
    await handleApiError(new Error("connection refused"), "save employee");
    expect(mockToastError).toHaveBeenCalledWith(
      expect.stringContaining("Failed to save employee"),
      expect.any(Object),
    );
  });
});
