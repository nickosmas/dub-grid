import { describe, it, expect, vi, beforeEach } from "vitest";
import { extractErrorMessage, handleApiError } from "@/lib/error-handling";

// Mock sonner toast
const mockToastError = vi.fn();
vi.mock("sonner", () => ({
  toast: { error: (...args: unknown[]) => mockToastError(...args) },
}));

// Mock supabase auth
const mockSignOut = vi.fn().mockResolvedValue({});
vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: { signOut: (...args: unknown[]) => mockSignOut(...args) },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null }),
    }),
  },
}));

// Mock window.location.replace
const mockReplace = vi.fn();
Object.defineProperty(window, "location", {
  value: { replace: mockReplace, href: "http://localhost" },
  writable: true,
});

beforeEach(() => {
  vi.clearAllMocks();
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
      expect.stringContaining("session has expired"),
      expect.any(Object),
    );
    expect(mockSignOut).toHaveBeenCalledWith({ scope: "local" });
    expect(mockReplace).toHaveBeenCalledWith("/");
  });

  it("handles Refresh Token Not Found the same way", async () => {
    await handleApiError(new Error("Refresh Token Not Found"));
    expect(mockToastError).toHaveBeenCalledWith(
      expect.stringContaining("session has expired"),
      expect.any(Object),
    );
    expect(mockSignOut).toHaveBeenCalled();
  });

  it("handles Invalid Refresh Token the same way", async () => {
    await handleApiError(new Error("Invalid Refresh Token"));
    expect(mockSignOut).toHaveBeenCalled();
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
    expect(mockToastError).toHaveBeenCalledWith("Something went wrong. Please try again.");
  });
});
