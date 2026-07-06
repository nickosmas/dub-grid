import { describe, it, expect, vi } from "vitest";

// ── Mock supabase (required by db/shared.ts import chain) ───────────────────
vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      lte: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null }),
      maybeSingle: vi.fn().mockResolvedValue({ data: null }),
    }),
  },
}));

// ── Mock cache (required by db/shared.ts) ───────────────────────────────────
vi.mock("@/lib/cache", () => ({
  cacheThrough: vi.fn(),
  cacheDel: vi.fn(),
  CacheKey: {},
  TTL: { STABLE: 300, MODERATE: 120, MIDDLEWARE: 30 },
}));

// ── Mock audit (required by db/shared.ts) ────────────────────────────────────
vi.mock("@/lib/audit", () => ({
  logAudit: vi.fn(),
}));

// ── Import the internal assertDateRange via fetchShifts ─────────────────────
// fetchShifts calls assertDateRange internally, so we test through the public API
import { fetchShifts } from "@/lib/db";

// Generic chainable query mock: every filter/order/range call returns the
// same object, and the object itself is thenable — matching how the real
// Supabase query builder can be awaited after any number of chained calls
// (select/eq/gte/lte/order/range), regardless of how many links are added.
function chainableQuery(result: { data: unknown; error: unknown }) {
  const query: Record<string, unknown> = {};
  for (const method of ["select", "eq", "gte", "lte", "order", "range"]) {
    query[method] = vi.fn(() => query);
  }
  query.then = (resolve: (value: unknown) => void) => resolve(result);
  return query;
}

describe("shift query date range guard", () => {
  it("throws when date range exceeds 366 days", async () => {
    const start = "2025-01-01";
    const end = "2026-01-03"; // 367 days apart

    await expect(
      fetchShifts("org-1", true, new Map(), undefined, start, end),
    ).rejects.toThrow("Shift query range exceeds 366 days");
  });

  it("throws for a range well over 366 days", async () => {
    const start = "2025-01-01";
    const end = "2027-01-01"; // ~730 days

    await expect(
      fetchShifts("org-1", true, new Map(), undefined, start, end),
    ).rejects.toThrow("Shift query range exceeds 366 days");
  });

  it("does not throw for a range within 366 days", async () => {
    const start = "2025-01-01";
    const end = "2025-06-01"; // ~151 days

    // The mock supabase returns { data: [], error: null } — we verify it
    // doesn't throw the date range error.
    const mockFrom = vi.fn().mockReturnValue(
      chainableQuery({ data: [], error: null }),
    );

    const { supabase } = await import("@/lib/supabase");
    (supabase.from as ReturnType<typeof vi.fn>).mockImplementation(mockFrom);

    // Should resolve without a date-range error
    const result = await fetchShifts(
      "org-1",
      true,
      new Map(),
      undefined,
      start,
      end,
    );
    expect(result).toEqual({});
  });

  it("does not throw at exactly 366 days (edge case)", async () => {
    const start = "2025-01-01";
    // 366 days = 366 * 86400000ms. 2025-01-01 + 366 days = 2026-01-02
    const end = "2026-01-02";

    const mockFrom = vi.fn().mockReturnValue(
      chainableQuery({ data: [], error: null }),
    );

    const { supabase } = await import("@/lib/supabase");
    (supabase.from as ReturnType<typeof vi.fn>).mockImplementation(mockFrom);

    // Exactly 366 days should be allowed (the guard is >366, not >=366)
    const result = await fetchShifts(
      "org-1",
      true,
      new Map(),
      undefined,
      start,
      end,
    );
    expect(result).toEqual({});
  });

  it("does not throw when no dates are provided", async () => {
    const mockFrom = vi.fn().mockReturnValue(
      chainableQuery({ data: [], error: null }),
    );

    const { supabase } = await import("@/lib/supabase");
    (supabase.from as ReturnType<typeof vi.fn>).mockImplementation(mockFrom);

    // No start/end dates — should not throw
    const result = await fetchShifts("org-1", true, new Map());
    expect(result).toEqual({});
  });

  it("does not throw when only startDate is provided", async () => {
    const mockFrom = vi.fn().mockReturnValue(
      chainableQuery({ data: [], error: null }),
    );

    const { supabase } = await import("@/lib/supabase");
    (supabase.from as ReturnType<typeof vi.fn>).mockImplementation(mockFrom);

    const result = await fetchShifts(
      "org-1",
      true,
      new Map(),
      undefined,
      "2025-01-01",
    );
    expect(result).toEqual({});
  });
});
