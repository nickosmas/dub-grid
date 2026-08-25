import "@testing-library/jest-dom";
import { vi } from "vitest";

// Supabase keys are read through `lib/supabase-keys`, whose `require*` helpers
// throw on a missing key rather than passing `undefined` down into the client
// behind a `!`. Tests that build a request-scoped client need *a* value, not a
// real one. `||=` so a test can still pin its own.
process.env.NEXT_PUBLIC_SUPABASE_URL ||= "http://127.0.0.1:54321";
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||= "test-publishable-key";
process.env.SUPABASE_SECRET_KEY ||= "test-secret-key";

// jsdom does not implement window.matchMedia — stub it for useMediaQuery.
// Guarded so a server-side test file can opt into the node environment
// (`// @vitest-environment node`) and still share this setup.
if (typeof window !== "undefined") {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null }),
      maybeSingle: vi.fn().mockResolvedValue({ data: null }),
    }),
  },
}));
