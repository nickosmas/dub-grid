/**
 * Property-based tests for TabCoordinator
 * Feature: supabase-multi-tab-refresh-fix
 *
 * Uses fast-check with a minimum of 100 iterations per property.
 */

import { describe, it, beforeEach, afterEach, expect } from "vitest";
import * as fc from "fast-check";
import { createTabCoordinator, serializeSession, deserializeSession } from "@/lib/tab-coordinator";

// ── Shared in-memory localStorage mock ────────────────────────────────────────

function createSharedLocalStorage() {
  const store = new Map<string, string>();

  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, value),
    removeItem: (key: string) => store.delete(key),
    clear: () => store.clear(),
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("Feature: supabase-multi-tab-refresh-fix, Property 1: Lock mutual exclusion", () => {
  let sharedStorage: ReturnType<typeof createSharedLocalStorage>;
  let originalLocalStorage: Storage;

  beforeEach(() => {
    sharedStorage = createSharedLocalStorage();
    originalLocalStorage = globalThis.localStorage;

    // Replace global localStorage with our shared in-memory mock
    Object.defineProperty(globalThis, "localStorage", {
      value: sharedStorage,
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(globalThis, "localStorage", {
      value: originalLocalStorage,
      writable: true,
      configurable: true,
    });
  });

  /**
   * Property 1: Lock mutual exclusion
   *
   * For any set of N concurrent acquireLock() calls from different simulated
   * tabs, at most 1 should return true at any given instant (when the lock is
   * not expired).
   *
   * Validates: Requirements 1.1, 1.2
   */
  it("Property 1: at most one tab acquires the lock when called concurrently", () => {
    fc.assert(
      fc.property(
        // Generate between 2 and 10 simulated tabs
        fc.integer({ min: 2, max: 10 }),
        (numTabs) => {
          // Reset shared storage for each run
          sharedStorage.clear();

          const lockKey = "sg_refresh_lock_test";

          // Create N TabCoordinator instances sharing the same localStorage
          const coordinators = Array.from({ length: numTabs }, () =>
            createTabCoordinator({
              lockKey,
              lockTtlMs: 10_000,
              // Disable BroadcastChannel to keep test focused on lock logic
              channelName: `test-channel-${Math.random()}`,
            }),
          );

          // Simulate concurrent acquireLock() calls (synchronous in JS, but
          // all reading the same initial state before any write completes)
          const results = coordinators.map((c) => c.acquireLock());

          // Cleanup
          coordinators.forEach((c) => c.destroy());

          // At most one tab should have won the lock
          const lockWinners = results.filter(Boolean);
          return lockWinners.length <= 1;
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Additional assertion: exactly one tab wins when no lock is pre-held.
   *
   * When the lock is free, the first writer wins. Because JS is single-threaded,
   * the first call in the array always writes first, so exactly 1 should win.
   */
  it("Property 1 (corollary): exactly one tab wins the lock from a clean state", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10 }),
        (numTabs) => {
          sharedStorage.clear();

          const lockKey = "sg_refresh_lock_corollary";

          const coordinators = Array.from({ length: numTabs }, () =>
            createTabCoordinator({
              lockKey,
              lockTtlMs: 10_000,
              channelName: `test-channel-${Math.random()}`,
            }),
          );

          const results = coordinators.map((c) => c.acquireLock());
          coordinators.forEach((c) => c.destroy());

          const winners = results.filter(Boolean);
          // At least 1 must win (lock was free), and at most 1 must win
          return winners.length >= 1 && winners.length <= 1;
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe("Feature: supabase-multi-tab-refresh-fix, Property 2: Lock TTL expiry", () => {
  let sharedStorage: ReturnType<typeof createSharedLocalStorage>;
  let originalLocalStorage: Storage;

  beforeEach(() => {
    sharedStorage = createSharedLocalStorage();
    originalLocalStorage = globalThis.localStorage;

    Object.defineProperty(globalThis, "localStorage", {
      value: sharedStorage,
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(globalThis, "localStorage", {
      value: originalLocalStorage,
      writable: true,
      configurable: true,
    });
  });

  /**
   * Property 2: Lock TTL expiry
   *
   * For any lock written with an `acquiredAt` timestamp older than `lockTtlMs`,
   * a subsequent `acquireLock()` call should return `true` (the stale lock is
   * treated as expired).
   *
   * Validates: Requirements 1.4
   */
  it("Property 2: acquireLock() returns true when the existing lock is older than TTL", () => {
    fc.assert(
      fc.property(
        // TTL between 100ms and 10s
        fc.integer({ min: 100, max: 10_000 }),
        // Extra age beyond TTL: 1ms to 60s past expiry
        fc.integer({ min: 1, max: 60_000 }),
        (lockTtlMs, extraAgeMs) => {
          sharedStorage.clear();

          const lockKey = "sg_refresh_lock_ttl_test";

          // Pre-populate localStorage with a stale lock from a different tab
          const staleAcquiredAt = Date.now() - lockTtlMs - extraAgeMs;
          const staleLock = {
            tabId: "some-other-tab-id",
            acquiredAt: staleAcquiredAt,
          };
          sharedStorage.setItem(lockKey, JSON.stringify(staleLock));

          // Create a new coordinator and attempt to acquire the lock
          const coordinator = createTabCoordinator({
            lockKey,
            lockTtlMs,
            channelName: `test-channel-ttl-${Math.random()}`,
          });

          const result = coordinator.acquireLock();
          coordinator.destroy();

          // The stale lock should be treated as expired — new tab must win
          return result === true;
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe("Feature: supabase-multi-tab-refresh-fix, Property 3: Lock release", () => {
  let sharedStorage: ReturnType<typeof createSharedLocalStorage>;
  let originalLocalStorage: Storage;

  beforeEach(() => {
    sharedStorage = createSharedLocalStorage();
    originalLocalStorage = globalThis.localStorage;

    Object.defineProperty(globalThis, "localStorage", {
      value: sharedStorage,
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(globalThis, "localStorage", {
      value: originalLocalStorage,
      writable: true,
      configurable: true,
    });
  });

  /**
   * Property 3: Lock release round-trip
   *
   * For any tab that holds the lock, calling releaseLock() should result in
   * acquireLock() returning true for the next caller (a different tab).
   *
   * Validates: Requirements 1.3
   */
  it("Property 3: after releaseLock(), a second coordinator can acquire the lock", () => {
    fc.assert(
      fc.property(
        // TTL between 1s and 30s — large enough that the lock won't expire mid-test
        fc.integer({ min: 1_000, max: 30_000 }),
        (lockTtlMs) => {
          sharedStorage.clear();

          const lockKey = `sg_refresh_lock_release_${Math.random()}`;

          // Tab A acquires the lock
          const tabA = createTabCoordinator({
            lockKey,
            lockTtlMs,
            channelName: `test-channel-release-${Math.random()}`,
          });

          const acquired = tabA.acquireLock();
          // Precondition: tab A must have won the lock
          if (!acquired) {
            tabA.destroy();
            return true; // skip this run — storage was not clean (shouldn't happen)
          }

          // Tab A releases the lock
          tabA.releaseLock();
          tabA.destroy();

          // Tab B (a different coordinator instance = different tabId) tries to acquire
          const tabB = createTabCoordinator({
            lockKey,
            lockTtlMs,
            channelName: `test-channel-release-${Math.random()}`,
          });

          const result = tabB.acquireLock();
          tabB.destroy();

          // Tab B must succeed because the lock was released
          return result === true;
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe("Feature: supabase-multi-tab-refresh-fix, Property 6: Near-expiry detection", () => {
  /**
   * Property 6: Near-expiry detection
   *
   * For any session whose `expires_at` is within `nearExpiryThresholdSec`
   * seconds of the current time, `isNearExpiry()` should return `true`;
   * for any session expiring further in the future, it should return `false`.
   *
   * Validates: Requirements 4.1
   */
  it("Property 6: isNearExpiry() matches expires_at - now < threshold", () => {
    const nearExpiryThresholdSec = 60;

    fc.assert(
      fc.property(
        // Generate expires_at as an offset in seconds from now.
        // Range: -300s (already expired) to +600s (10 min in the future).
        fc.integer({ min: -300, max: 600 }),
        (offsetSec) => {
          const nowSec = Date.now() / 1000;
          const expiresAt = Math.floor(nowSec) + offsetSec;

          // Build a minimal mock Session with the generated expires_at
          const session = {
            expires_at: expiresAt,
            access_token: "mock-access-token",
            refresh_token: "mock-refresh-token",
            token_type: "bearer",
            user: { id: "user-id" },
          } as unknown as import("@supabase/supabase-js").Session;

          const coordinator = createTabCoordinator({ nearExpiryThresholdSec });
          const result = coordinator.isNearExpiry(session);
          coordinator.destroy();

          // Expected: true when expires_at is within the threshold of now
          const expected = expiresAt - nowSec < nearExpiryThresholdSec;
          return result === expected;
        },
      ),
      { numRuns: 100 },
    );
  });

  it("Property 6 (null session): isNearExpiry(null) always returns true", () => {
    const coordinator = createTabCoordinator();
    const result = coordinator.isNearExpiry(null);
    coordinator.destroy();
    expect(result).toBe(true);
  });

  it("Property 6 (custom threshold): respects custom nearExpiryThresholdSec option", () => {
    fc.assert(
      fc.property(
        // Custom threshold between 10s and 300s
        fc.integer({ min: 10, max: 300 }),
        // Offset from now in seconds: -60 to +600
        fc.integer({ min: -60, max: 600 }),
        (thresholdSec, offsetSec) => {
          const nowSec = Date.now() / 1000;
          const expiresAt = Math.floor(nowSec) + offsetSec;

          const session = {
            expires_at: expiresAt,
            access_token: "mock-access-token",
            refresh_token: "mock-refresh-token",
            token_type: "bearer",
            user: { id: "user-id" },
          } as unknown as import("@supabase/supabase-js").Session;

          const coordinator = createTabCoordinator({ nearExpiryThresholdSec: thresholdSec });
          const result = coordinator.isNearExpiry(session);
          coordinator.destroy();

          const expected = expiresAt - nowSec < thresholdSec;
          return result === expected;
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe("Feature: supabase-multi-tab-refresh-fix, Property 8: Graceful degradation", () => {
  let originalLocalStorage: Storage;
  let originalBroadcastChannel: typeof BroadcastChannel | undefined;

  beforeEach(() => {
    originalLocalStorage = globalThis.localStorage;
    originalBroadcastChannel = (globalThis as Record<string, unknown>)
      .BroadcastChannel as typeof BroadcastChannel | undefined;
  });

  afterEach(() => {
    // Restore localStorage
    Object.defineProperty(globalThis, "localStorage", {
      value: originalLocalStorage,
      writable: true,
      configurable: true,
    });

    // Restore BroadcastChannel
    if (originalBroadcastChannel !== undefined) {
      (globalThis as Record<string, unknown>).BroadcastChannel = originalBroadcastChannel;
    } else {
      delete (globalThis as Record<string, unknown>).BroadcastChannel;
    }
  });

  /**
   * Property 8: Graceful degradation — no throw
   *
   * For any call to TabCoordinator methods when BroadcastChannel is undefined
   * or localStorage throws, the method should return a safe default value and
   * not throw an exception.
   *
   * Validates: Requirements 3.1, 3.3
   */
  it("Property 8: no method throws when localStorage throws and BroadcastChannel is undefined", () => {
    // Arbitraries for random inputs
    const sessionArb = fc.record({
      access_token: fc.string({ minLength: 1, maxLength: 64 }),
      refresh_token: fc.string({ minLength: 1, maxLength: 64 }),
      expires_at: fc.integer({ min: 0, max: 9_999_999_999 }),
      token_type: fc.constantFrom("bearer", "Bearer"),
      user: fc.record({ id: fc.string({ minLength: 1, maxLength: 36 }) }),
    }) as fc.Arbitrary<import("@supabase/supabase-js").Session>;

    const syncMessageArb: fc.Arbitrary<import("@/lib/tab-coordinator").SyncMessage> = fc.oneof(
      fc.record({
        type: fc.constant("SESSION_REFRESHED" as const),
        session: fc.record({
          access_token: fc.string({ minLength: 1, maxLength: 64 }),
          refresh_token: fc.string({ minLength: 1, maxLength: 64 }),
          expires_at: fc.integer({ min: 0, max: 9_999_999_999 }),
          token_type: fc.constant("bearer" as const),
          user: fc.record({ id: fc.string({ minLength: 1, maxLength: 36 }) }) as fc.Arbitrary<
            import("@supabase/supabase-js").User
          >,
        }),
      }),
      fc.record({ type: fc.constant("SIGNED_OUT" as const) }),
    );

    fc.assert(
      fc.property(
        sessionArb,
        syncMessageArb,
        (session, syncMessage) => {
          // ── Setup broken environment ─────────────────────────────────────

          // Make localStorage throw on every operation
          const throwingStorage = {
            getItem: () => { throw new Error("localStorage unavailable"); },
            setItem: () => { throw new Error("localStorage unavailable"); },
            removeItem: () => { throw new Error("localStorage unavailable"); },
            clear: () => { throw new Error("localStorage unavailable"); },
            key: () => { throw new Error("localStorage unavailable"); },
            length: 0,
          } as unknown as Storage;

          Object.defineProperty(globalThis, "localStorage", {
            value: throwingStorage,
            writable: true,
            configurable: true,
          });

          // Remove BroadcastChannel from globalThis
          delete (globalThis as Record<string, unknown>).BroadcastChannel;

          // ── Create coordinator in broken environment ──────────────────────
          let coordinator: import("@/lib/tab-coordinator").TabCoordinator;
          try {
            coordinator = createTabCoordinator({
              lockKey: "sg_refresh_lock_degradation",
              channelName: "sg_auth_sync_degradation",
            });
          } catch {
            // createTabCoordinator itself must not throw — if it does, fail
            return false;
          }

          // ── Call every method and assert no throw ─────────────────────────
          try {
            coordinator.acquireLock();
            coordinator.releaseLock();
            coordinator.isLeader();
            coordinator.broadcast(syncMessage);
            const unsub = coordinator.onMessage(() => { });
            unsub(); // also call the returned unsubscribe function
            coordinator.isNearExpiry(session);
            coordinator.isNearExpiry(null);
            coordinator.destroy();
          } catch {
            return false;
          }

          return true;
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe("Feature: supabase-multi-tab-refresh-fix, Property 4: Session broadcast round-trip", () => {
  /**
   * Property 4: Session broadcast round-trip serialisation
   *
   * For any valid Supabase Session object, serialising it into a SyncMessage
   * and deserialising it back should produce an object with identical
   * access_token, refresh_token, expires_at, and user.id fields.
   *
   * Validates: Requirements 2.1, 2.2
   */
  it("Property 4: deserializeSession(serializeSession(s)) preserves key session fields", () => {
    fc.assert(
      fc.property(
        fc.record({
          access_token: fc.string({ minLength: 1, maxLength: 256 }),
          refresh_token: fc.string({ minLength: 1, maxLength: 256 }),
          // expires_at is Unix seconds — generate a plausible range
          expires_at: fc.integer({ min: 0, max: 9_999_999_999 }),
          token_type: fc.constantFrom("bearer", "Bearer"),
          user: fc.record({
            id: fc.string({ minLength: 1, maxLength: 36 }),
          }),
        }),
        (raw) => {
          const session = raw as unknown as import("@supabase/supabase-js").Session;

          const serialized = serializeSession(session);
          const deserialized = deserializeSession(serialized);

          return (
            deserialized.access_token === session.access_token &&
            deserialized.refresh_token === session.refresh_token &&
            deserialized.expires_at === session.expires_at &&
            deserialized.user.id === session.user.id
          );
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ── Property 5: RBAC claims re-extraction after broadcast ─────────────────────

/**
 * Mirrors the extractClaims logic from AuthProvider.tsx (pure function, not exported).
 * Decodes a JWT access_token and returns the RBAC claims embedded by the
 * custom_access_token_hook.
 */
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const [, payload] = token.split(".");
    if (!payload) return null;
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const json = atob(
      base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "="),
    );
    return JSON.parse(json);
  } catch {
    return null;
  }
}

type CompanyRole = "admin" | "scheduler" | "supervisor" | "user";
type PlatformRole = "gridmaster" | "none";

const VALID_COMPANY_ROLES: CompanyRole[] = ["admin", "scheduler", "supervisor", "user"];

function extractClaims(accessToken: string): {
  platformRole: PlatformRole;
  companyRole: CompanyRole | null;
  companyId: string | null;
  companySlug: string | null;
} {
  const raw = decodeJwtPayload(accessToken);

  const platformRole: PlatformRole =
    raw?.platform_role === "gridmaster" ? "gridmaster" : "none";

  const companyRoleRaw = raw?.company_role as string | undefined;
  const normalizedCompanyRole = companyRoleRaw === "sovereign" ? "admin" : companyRoleRaw;
  const companyRole: CompanyRole | null =
    normalizedCompanyRole && VALID_COMPANY_ROLES.includes(normalizedCompanyRole as CompanyRole)
      ? (normalizedCompanyRole as CompanyRole)
      : null;

  const companyId =
    typeof raw?.company_id === "string" && raw.company_id ? raw.company_id : null;
  const companySlug =
    typeof raw?.company_slug === "string" && raw.company_slug ? raw.company_slug : null;

  return { platformRole, companyRole, companyId, companySlug };
}

/**
 * Encodes a JSON payload as a base64url string (no padding), suitable for use
 * as the middle segment of a JWT access_token.
 */
function encodeJwtPayload(payload: Record<string, unknown>): string {
  const json = JSON.stringify(payload);
  // btoa works on ASCII; use encodeURIComponent + unescape trick for safety
  const base64 = btoa(unescape(encodeURIComponent(json)));
  // Convert standard base64 → base64url (no padding)
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Builds a fake JWT with the given payload embedded as the second segment.
 * The header and signature are static placeholders — only the payload matters
 * for claim extraction.
 */
function buildFakeJwt(payload: Record<string, unknown>): string {
  const header = encodeJwtPayload({ alg: "HS256", typ: "JWT" });
  const encodedPayload = encodeJwtPayload(payload);
  return `${header}.${encodedPayload}.fakesignature`;
}

describe("Feature: supabase-multi-tab-refresh-fix, Property 5: RBAC claims re-extraction", () => {
  /**
   * Property 5: RBAC claims re-extraction after broadcast
   *
   * For any session broadcast received by a Follower Tab, the RBAC claims
   * extracted from the new access_token should equal the claims that would be
   * extracted by calling extractClaims directly on that session.
   *
   * Test steps:
   * 1. Generate random RBAC claim values
   * 2. Build a fake JWT with those claims in the payload (base64url-encoded)
   * 3. Create a session with that access_token
   * 4. Serialize and deserialize the session (broadcast round-trip)
   * 5. Extract claims from both the original and deserialized session
   * 6. Assert they match
   *
   * Validates: Requirements 2.3
   */
  it("Property 5: extractClaims output after broadcast round-trip matches direct extraction", () => {
    // Arbitraries for RBAC claim values
    const platformRoleArb = fc.oneof(
      fc.constant("gridmaster"),
      fc.constant("none"),
      fc.constant("other-value"), // should map to "none"
    );

    const companyRoleArb = fc.oneof(
      fc.constantFrom("admin", "scheduler", "supervisor", "user"),
      fc.constant("sovereign"), // should normalize to "admin"
      fc.constant("unknown-role"), // should map to null
      fc.constant(""), // should map to null
    );

    const uuidArb = fc.uuid();
    const slugArb = fc.stringMatching(/^[a-z0-9-]{3,20}$/);

    // Nullable versions
    const nullableUuidArb = fc.oneof(uuidArb, fc.constant(""));
    const nullableSlugArb = fc.oneof(slugArb, fc.constant(""));

    fc.assert(
      fc.property(
        platformRoleArb,
        companyRoleArb,
        nullableUuidArb,
        nullableSlugArb,
        (platform_role, company_role, company_id, company_slug) => {
          // Step 1 & 2: Build a fake JWT embedding the RBAC claims
          const jwtPayload: Record<string, unknown> = {
            sub: "user-123",
            exp: Math.floor(Date.now() / 1000) + 3600,
          };

          // Only embed non-empty claim values (mirrors real JWT behaviour)
          if (platform_role) jwtPayload.platform_role = platform_role;
          if (company_role) jwtPayload.company_role = company_role;
          if (company_id) jwtPayload.company_id = company_id;
          if (company_slug) jwtPayload.company_slug = company_slug;

          const accessToken = buildFakeJwt(jwtPayload);

          // Step 3: Create a minimal session with that access_token
          const originalSession = {
            access_token: accessToken,
            refresh_token: "refresh-token-abc",
            expires_at: Math.floor(Date.now() / 1000) + 3600,
            token_type: "bearer",
            user: { id: "user-123" },
          } as unknown as import("@supabase/supabase-js").Session;

          // Step 4: Serialize and deserialize (broadcast round-trip)
          const serialized = serializeSession(originalSession);
          const deserialized = deserializeSession(serialized);

          // Step 5: Extract claims from both
          const claimsFromOriginal = extractClaims(originalSession.access_token);
          const claimsFromDeserialized = extractClaims(deserialized.access_token);

          // Step 6: Assert they match
          return (
            claimsFromOriginal.platformRole === claimsFromDeserialized.platformRole &&
            claimsFromOriginal.companyRole === claimsFromDeserialized.companyRole &&
            claimsFromOriginal.companyId === claimsFromDeserialized.companyId &&
            claimsFromOriginal.companySlug === claimsFromDeserialized.companySlug
          );
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ── Property 7: Sign-out broadcast propagation ────────────────────────────────

/**
 * A shared mock BroadcastChannel that routes postMessage calls to all other
 * instances' onmessage handlers within the same "channel name" group.
 * This simulates real BroadcastChannel behaviour in jsdom/vitest where
 * messages are NOT automatically propagated between instances.
 */
function createMockBroadcastChannelFactory() {
  // Map from channel name → list of active mock instances
  const registry = new Map<string, MockBroadcastChannel[]>();

  class MockBroadcastChannel {
    name: string;
    onmessage: ((event: MessageEvent) => void) | null = null;
    closed = false;

    constructor(name: string) {
      this.name = name;
      if (!registry.has(name)) registry.set(name, []);
      registry.get(name)!.push(this);
    }

    postMessage(data: unknown): void {
      if (this.closed) return;
      const peers = registry.get(this.name) ?? [];
      for (const peer of peers) {
        // BroadcastChannel does NOT deliver to the sender itself
        if (peer !== this && !peer.closed && peer.onmessage) {
          peer.onmessage({ data } as MessageEvent);
        }
      }
    }

    close(): void {
      this.closed = true;
      const peers = registry.get(this.name);
      if (peers) {
        const idx = peers.indexOf(this);
        if (idx !== -1) peers.splice(idx, 1);
      }
    }
  }

  return {
    MockBroadcastChannel,
    /** Reset all registries between test runs. */
    reset() {
      registry.clear();
    },
  };
}

describe("Feature: supabase-multi-tab-refresh-fix, Property 7: Sign-out broadcast propagation", () => {
  let originalBroadcastChannel: typeof BroadcastChannel | undefined;
  let factory: ReturnType<typeof createMockBroadcastChannelFactory>;

  beforeEach(() => {
    originalBroadcastChannel = (globalThis as Record<string, unknown>)
      .BroadcastChannel as typeof BroadcastChannel | undefined;

    factory = createMockBroadcastChannelFactory();

    // Install the mock BroadcastChannel globally
    (globalThis as Record<string, unknown>).BroadcastChannel =
      factory.MockBroadcastChannel as unknown as typeof BroadcastChannel;
  });

  afterEach(() => {
    factory.reset();

    if (originalBroadcastChannel !== undefined) {
      (globalThis as Record<string, unknown>).BroadcastChannel = originalBroadcastChannel;
    } else {
      delete (globalThis as Record<string, unknown>).BroadcastChannel;
    }
  });

  /**
   * Property 7: Sign-out broadcast propagation
   *
   * For any number of simulated tabs (1–10), broadcasting SIGNED_OUT from one
   * tab should cause every registered onMessage handler in all other tabs to
   * receive exactly one SIGNED_OUT message.
   *
   * Validates: Requirements 5.1
   */
  it("Property 7: all onMessage handlers receive exactly one SIGNED_OUT when broadcast from one tab", () => {
    fc.assert(
      fc.property(
        // Generate between 1 and 10 tabs
        fc.integer({ min: 1, max: 10 }),
        // Index of the tab that broadcasts SIGNED_OUT (0-based)
        fc.integer({ min: 0, max: 9 }),
        (numTabs, senderIndexRaw) => {
          factory.reset();

          // Clamp sender index to valid range for this run
          const senderIndex = senderIndexRaw % numTabs;

          // Use a unique channel name per run to avoid cross-run interference
          const channelName = `sg_auth_sync_prop7_${Math.random()}`;

          // Step 1 & 2: Create N TabCoordinator instances
          const coordinators = Array.from({ length: numTabs }, () =>
            createTabCoordinator({ channelName }),
          );

          // Step 3: Register onMessage handlers on ALL instances and count SIGNED_OUT messages
          const receivedCounts = new Array<number>(numTabs).fill(0);

          const unsubscribers = coordinators.map((coordinator, i) =>
            coordinator.onMessage((msg) => {
              if (msg.type === "SIGNED_OUT") {
                receivedCounts[i]++;
              }
            }),
          );

          // Step 4: Broadcast SIGNED_OUT from the chosen sender tab
          coordinators[senderIndex].broadcast({ type: "SIGNED_OUT" });

          // Step 5: Assert all OTHER tabs received exactly one SIGNED_OUT
          // The sender itself should NOT receive its own broadcast (BroadcastChannel spec)
          let allCorrect = true;
          for (let i = 0; i < numTabs; i++) {
            if (i === senderIndex) {
              // Sender should NOT receive its own message
              if (receivedCounts[i] !== 0) {
                allCorrect = false;
                break;
              }
            } else {
              // Every other tab should receive exactly one SIGNED_OUT
              if (receivedCounts[i] !== 1) {
                allCorrect = false;
                break;
              }
            }
          }

          // Cleanup
          unsubscribers.forEach((unsub) => unsub());
          coordinators.forEach((c) => c.destroy());

          return allCorrect;
        },
      ),
      { numRuns: 100 },
    );
  });
});
