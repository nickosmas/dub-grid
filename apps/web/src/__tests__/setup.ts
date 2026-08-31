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

// Node 26 defines its own `globalThis.localStorage`, which is undefined unless
// the runtime is started with --localstorage-file, and it shadows the one jsdom
// installs. Tests that clear storage in beforeEach then fail on undefined. Give
// them a real in-memory Storage rather than making every call site defensive.
if (typeof window !== "undefined") {
  const createStorage = (): Storage => {
    let entries = new Map<string, string>();
    return {
      get length() {
        return entries.size;
      },
      clear: () => {
        entries = new Map();
      },
      getItem: (key: string) => entries.get(key) ?? null,
      key: (index: number) => Array.from(entries.keys())[index] ?? null,
      removeItem: (key: string) => {
        entries.delete(key);
      },
      setItem: (key: string, value: string) => {
        entries.set(key, String(value));
      },
    } as Storage;
  };

  for (const name of ["localStorage", "sessionStorage"] as const) {
    let storage: Storage | undefined;
    try {
      storage = window[name];
    } catch {
      storage = undefined;
    }
    if (storage == null) {
      const value = createStorage();
      Object.defineProperty(window, name, { writable: true, configurable: true, value });
      Object.defineProperty(globalThis, name, { writable: true, configurable: true, value });
    }
  }
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
