import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";

// ── Mock Sentry ─────────────────────────────────────────────────────────────
vi.mock("@/lib/sentry", () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  setUser: vi.fn(),
  setTag: vi.fn(),
}));

// ── Mock supabase channel ───────────────────────────────────────────────────

type CdcCallback = (payload: {
  new?: Record<string, unknown>;
  old?: Record<string, unknown>;
}) => void;

type SubscribeCallback = (status: string, err?: Error) => void;

interface MockChannel {
  on: ReturnType<typeof vi.fn>;
  subscribe: ReturnType<typeof vi.fn>;
  /** Stored CDC handlers keyed by table name */
  _handlers: Map<string, CdcCallback>;
  /** The subscribe status callback */
  _subscribeCallback: SubscribeCallback | null;
}

let mockChannel: MockChannel;
const mockRemoveChannel = vi.fn();

function createMockChannel(): MockChannel {
  const handlers = new Map<string, CdcCallback>();
  let subscribeCallback: SubscribeCallback | null = null;

  const channel: MockChannel = {
    _handlers: handlers,
    _subscribeCallback: null,
    on: vi.fn((_event: string, opts: Record<string, unknown>, cb: CdcCallback) => {
      handlers.set(opts.table as string, cb);
      return channel;
    }),
    subscribe: vi.fn((cb: SubscribeCallback) => {
      subscribeCallback = cb;
      channel._subscribeCallback = cb;
      return channel;
    }),
  };

  return channel;
}

vi.mock("@/lib/supabase", () => ({
  supabase: {
    channel: vi.fn(() => mockChannel),
    removeChannel: (...args: unknown[]) => mockRemoveChannel(...args),
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null }),
      maybeSingle: vi.fn().mockResolvedValue({ data: null }),
    }),
  },
}));

// ── Import after mocks ──────────────────────────────────────────────────────
import { useRealtimeInvalidation } from "@/hooks/useRealtimeInvalidation";

// ── Helpers ─────────────────────────────────────────────────────────────────

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return {
    queryClient,
    wrapper: ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client: queryClient }, children),
  };
}

// ── Expected tables ─────────────────────────────────────────────────────────

const EXPECTED_TABLES = [
  "focus_areas",
  "shift_codes",
  "absence_types",
  "coverage_requirements",
  "employees",
  "shifts",
  "shift_categories",
  "recurring_shifts",
  "shift_requests",
  "organization_memberships",
];

// ══════════════════════════════════════════════════════════════════════════════

beforeEach(() => {
  vi.clearAllMocks();
  mockChannel = createMockChannel();
});

describe("useRealtimeInvalidation", () => {
  describe("TABLE_KEY_MAP coverage", () => {
    it("subscribes to all expected tables", () => {
      const { wrapper } = createWrapper();
      renderHook(() => useRealtimeInvalidation("org-1"), { wrapper });

      const subscribedTables = Array.from(mockChannel._handlers.keys());
      for (const table of EXPECTED_TABLES) {
        expect(subscribedTables).toContain(table);
      }
      expect(subscribedTables).toHaveLength(EXPECTED_TABLES.length);
    });
  });

  describe("CDC event handling", () => {
    it("invalidates the correct query key when a CDC event fires", () => {
      const { queryClient, wrapper } = createWrapper();
      const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
      renderHook(() => useRealtimeInvalidation("org-1"), { wrapper });

      // Simulate a CDC event on the focus_areas table
      const focusAreasHandler = mockChannel._handlers.get("focus_areas");
      expect(focusAreasHandler).toBeDefined();
      focusAreasHandler!({ new: { org_id: "org-1", id: 1, name: "ICU" } });

      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ["org", "org-1", "focusAreas"],
      });
    });

    it("invalidates employees key on employees CDC event", () => {
      const { queryClient, wrapper } = createWrapper();
      const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
      renderHook(() => useRealtimeInvalidation("org-1"), { wrapper });

      const employeesHandler = mockChannel._handlers.get("employees");
      employeesHandler!({ new: { org_id: "org-1", id: "emp-1" } });

      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ["employees", "org-1"],
      });
    });

    it("invalidates shifts key on shifts CDC event", () => {
      const { queryClient, wrapper } = createWrapper();
      const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
      renderHook(() => useRealtimeInvalidation("org-1"), { wrapper });

      const shiftsHandler = mockChannel._handlers.get("shifts");
      shiftsHandler!({ new: { org_id: "org-1" } });

      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ["shifts", "org-1"],
      });
    });

    it("invalidates recurringShifts key on recurring_shifts CDC event", () => {
      const { queryClient, wrapper } = createWrapper();
      const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
      renderHook(() => useRealtimeInvalidation("org-1"), { wrapper });

      const handler = mockChannel._handlers.get("recurring_shifts");
      handler!({ new: { org_id: "org-1" } });

      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ["recurringShifts", "org-1"],
      });
    });

    it("invalidates shiftRequests key on shift_requests CDC event", () => {
      const { queryClient, wrapper } = createWrapper();
      const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
      renderHook(() => useRealtimeInvalidation("org-1"), { wrapper });

      const handler = mockChannel._handlers.get("shift_requests");
      handler!({ new: { org_id: "org-1" } });

      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ["shiftRequests", "org-1"],
      });
    });

    it("invalidates users key on organization_memberships CDC event", () => {
      const { queryClient, wrapper } = createWrapper();
      const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
      renderHook(() => useRealtimeInvalidation("org-1"), { wrapper });

      const handler = mockChannel._handlers.get("organization_memberships");
      handler!({ new: { org_id: "org-1" } });

      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ["org", "org-1", "users"],
      });
    });
  });

  describe("org_id mismatch filtering", () => {
    it("ignores CDC events when org_id does not match", () => {
      const { queryClient, wrapper } = createWrapper();
      const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
      renderHook(() => useRealtimeInvalidation("org-1"), { wrapper });

      const focusAreasHandler = mockChannel._handlers.get("focus_areas");
      focusAreasHandler!({ new: { org_id: "org-DIFFERENT", id: 1 } });

      expect(invalidateSpy).not.toHaveBeenCalled();
    });

    it("processes events when org_id matches", () => {
      const { queryClient, wrapper } = createWrapper();
      const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
      renderHook(() => useRealtimeInvalidation("org-1"), { wrapper });

      const handler = mockChannel._handlers.get("shift_codes");
      handler!({ new: { org_id: "org-1", id: 1 } });

      expect(invalidateSpy).toHaveBeenCalledTimes(1);
    });

    it("processes DELETE events (payload.old) with matching org_id", () => {
      const { queryClient, wrapper } = createWrapper();
      const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
      renderHook(() => useRealtimeInvalidation("org-1"), { wrapper });

      const handler = mockChannel._handlers.get("focus_areas");
      // DELETE events have payload.old, not payload.new
      handler!({ old: { org_id: "org-1", id: 1 } });

      expect(invalidateSpy).toHaveBeenCalledTimes(1);
    });

    it("ignores DELETE events with mismatched org_id", () => {
      const { queryClient, wrapper } = createWrapper();
      const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
      renderHook(() => useRealtimeInvalidation("org-1"), { wrapper });

      const handler = mockChannel._handlers.get("focus_areas");
      handler!({ old: { org_id: "org-OTHER", id: 1 } });

      expect(invalidateSpy).not.toHaveBeenCalled();
    });
  });

  describe("error recovery", () => {
    it("invalidates all keys after CHANNEL_ERROR → SUBSCRIBED recovery", () => {
      const { queryClient, wrapper } = createWrapper();
      const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
      renderHook(() => useRealtimeInvalidation("org-1"), { wrapper });

      const subscribeCallback = mockChannel._subscribeCallback;
      expect(subscribeCallback).not.toBeNull();

      // Simulate CHANNEL_ERROR first
      subscribeCallback!("CHANNEL_ERROR", new Error("connection lost"));
      invalidateSpy.mockClear();

      // Then simulate recovery to SUBSCRIBED
      subscribeCallback!("SUBSCRIBED");

      // All tracked tables should have been invalidated
      expect(invalidateSpy).toHaveBeenCalledTimes(EXPECTED_TABLES.length);
    });

    it("does not bulk-invalidate on initial SUBSCRIBED (no prior error)", () => {
      const { queryClient, wrapper } = createWrapper();
      const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
      renderHook(() => useRealtimeInvalidation("org-1"), { wrapper });

      const subscribeCallback = mockChannel._subscribeCallback;
      // Simulate initial successful subscription — no prior error
      subscribeCallback!("SUBSCRIBED");

      // Should NOT bulk-invalidate since hadError was never set
      expect(invalidateSpy).not.toHaveBeenCalled();
    });
  });

  describe("no-op when orgId is null", () => {
    it("does not subscribe to any channel when orgId is null", () => {
      const { wrapper } = createWrapper();
      renderHook(() => useRealtimeInvalidation(null), { wrapper });

      // supabase.channel is the vi.fn() from our mock — it should not be called
      // when orgId is null (the effect early-returns).
      expect(mockChannel.on).not.toHaveBeenCalled();
      expect(mockChannel.subscribe).not.toHaveBeenCalled();
    });
  });

  describe("cleanup", () => {
    it("removes channel on unmount", () => {
      const { wrapper } = createWrapper();
      const { unmount } = renderHook(
        () => useRealtimeInvalidation("org-1"),
        { wrapper },
      );

      unmount();

      expect(mockRemoveChannel).toHaveBeenCalledWith(mockChannel);
    });
  });
});
