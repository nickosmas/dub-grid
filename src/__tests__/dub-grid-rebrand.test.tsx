import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import * as fc from "fast-check";
import { metadata } from "../app/layout";

// ─── Mocks ───────────────────────────────────────────────────────────────────

vi.mock("@/components/AuthProvider", () => ({
  useAuth: vi.fn(),
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock("@/lib/db", () => ({
  checkIsSuperAdmin: vi.fn(),
}));

import { useAuth } from "@/components/AuthProvider";
import { checkIsSuperAdmin } from "@/lib/db";
import WelcomePage from "../app/page";
import OnboardingPage from "../app/onboarding/page";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function setupAuth(overrides: Partial<ReturnType<typeof useAuth>> = {}) {
  vi.mocked(useAuth).mockReturnValue({
    user: null,
    signOut: vi.fn(),
    isSuperAdmin: false,
    isLoading: false,
    ...overrides,
  } as ReturnType<typeof useAuth>);
}

beforeEach(() => {
  vi.clearAllMocks();
  setupAuth();
});

// ─── 4.1 Example tests: UI branding surfaces ─────────────────────────────────

describe("Landing page — DubGrid branding (Requirements 1.2)", () => {
  it('renders "DubGrid" in the header', () => {
    render(<WelcomePage />);
    // The header span with DubGrid text
    expect(screen.getByText("DubGrid")).toBeInTheDocument();
  });

  it('renders "DubGrid" in the footer', () => {
    render(<WelcomePage />);
    const footer = document.querySelector("footer");
    expect(footer?.textContent).toContain("DubGrid");
  });

  it('renders "DG" logo mark in the header (Requirements 1.5)', () => {
    render(<WelcomePage />);
    expect(screen.getByText("DG")).toBeInTheDocument();
  });
});

describe("Onboarding page — DG logo mark (Requirements 1.4, 1.5)", () => {
  it('renders "DG" logo mark when user is a non-super-admin', async () => {
    const mockUser = { id: "user-123" };
    setupAuth({
      user: mockUser as ReturnType<typeof useAuth>["user"],
      isLoading: false,
    });
    vi.mocked(checkIsSuperAdmin).mockResolvedValue(false);

    render(<OnboardingPage />);

    await waitFor(() => {
      expect(screen.getByText("DG")).toBeInTheDocument();
    });
  });
});

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
