import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fc from "fast-check";

/**
 * RBAC System Property-Based Tests
 *
 * These tests verify the correctness properties of the RBAC system
 * as defined in the design document.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

type OrganizationRole = "super_admin" | "admin" | "user";
type PromotableRole = "admin" | "gridmaster";
type AllRoles = OrganizationRole | "gridmaster";

interface RoleChangeResult {
  status: "success" | "already_applied";
  from_role?: string;
  to_role?: string;
}

interface RoleChangeLogEntry {
  target_user_id: string;
  changed_by_id: string;
  from_role: string;
  to_role: string;
  idempotency_key: string;
}

class AdminPromotionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdminPromotionError";
  }
}

class RLSPolicyViolationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RLSPolicyViolationError";
  }
}

// ── Mock Implementation ───────────────────────────────────────────────────────

/**
 * Simulates the change_user_role RPC behavior for testing.
 * This mock implements the same idempotency logic as the actual database function.
 */
function createMockRoleChangeSystem() {
  // In-memory state to simulate database
  const roleChangeLog: RoleChangeLogEntry[] = [];
  const userRoles: Map<string, AllRoles> = new Map();
  const callerRoles: Map<string, AllRoles> = new Map();

  /**
   * Simulates the change_user_role RPC function.
   * Implements idempotency check, caller permission verification, and role change logic.
   */
  function changeUserRole(
    targetUserId: string,
    newRole: AllRoles,
    changedById: string,
    idempotencyKey: string
  ): RoleChangeResult {
    // 1. Idempotency check: Return early if this operation was already applied
    const existingEntry = roleChangeLog.find(
      (entry) => entry.idempotency_key === idempotencyKey
    );

    if (existingEntry) {
      return { status: "already_applied" };
    }

    // 2. Get current role (simulate SELECT FOR UPDATE)
    const currentRole = userRoles.get(targetUserId) || "user";

    // 3. Verify caller permissions - admin cannot promote to admin or gridmaster
    const callerRole = callerRoles.get(changedById) || "user";
    if (callerRole === "admin" && (newRole === "admin" || newRole === "gridmaster")) {
      throw new AdminPromotionError("admin cannot promote to admin or gridmaster");
    }

    // 4. Apply role change
    userRoles.set(targetUserId, newRole);

    // 5. Write audit log
    roleChangeLog.push({
      target_user_id: targetUserId,
      changed_by_id: changedById,
      from_role: currentRole,
      to_role: newRole,
      idempotency_key: idempotencyKey,
    });

    return {
      status: "success",
      from_role: currentRole,
      to_role: newRole,
    };
  }

  /**
   * Simulates attempting to UPDATE a role_change_log entry.
   * RLS policies should reject this operation, making the audit trail immutable.
   */
  function updateAuditLogEntry(
    idempotencyKey: string,
    _newValues: Partial<RoleChangeLogEntry>
  ): void {
    // Check if entry exists
    const existingEntry = roleChangeLog.find(
      (entry) => entry.idempotency_key === idempotencyKey
    );

    if (!existingEntry) {
      throw new Error("Audit log entry not found");
    }

    // Simulate RLS policy rejection - NO UPDATE policies exist on role_change_log
    throw new RLSPolicyViolationError(
      "UPDATE operation rejected by RLS policy: role_change_log is immutable"
    );
  }

  /**
   * Simulates attempting to DELETE a role_change_log entry.
   * RLS policies should reject this operation, making the audit trail immutable.
   */
  function deleteAuditLogEntry(idempotencyKey: string): void {
    // Check if entry exists
    const existingEntry = roleChangeLog.find(
      (entry) => entry.idempotency_key === idempotencyKey
    );

    if (!existingEntry) {
      throw new Error("Audit log entry not found");
    }

    // Simulate RLS policy rejection - NO DELETE policies exist on role_change_log
    throw new RLSPolicyViolationError(
      "DELETE operation rejected by RLS policy: role_change_log is immutable"
    );
  }

  return {
    changeUserRole,
    getUserRole: (userId: string) => userRoles.get(userId),
    setUserRole: (userId: string, role: AllRoles) => userRoles.set(userId, role),
    setCallerRole: (userId: string, role: AllRoles) => callerRoles.set(userId, role),
    getCallerRole: (userId: string) => callerRoles.get(userId),
    getRoleChangeLog: () => [...roleChangeLog],
    updateAuditLogEntry,
    deleteAuditLogEntry,
    reset: () => {
      roleChangeLog.length = 0;
      userRoles.clear();
      callerRoles.clear();
    },
  };
}

// ── Arbitraries ───────────────────────────────────────────────────────────────

const arbUuid = fc.uuid();
const arbOrgRole = fc.constantFrom<OrganizationRole>("super_admin", "admin", "user");
const arbIdempotencyKey = fc.uuid();
const arbPromotableRole = fc.constantFrom<PromotableRole>("admin", "gridmaster");
const arbNonPromotableOrgRole = fc.constantFrom<OrganizationRole>("user");
const arbAllRoles = fc.constantFrom<AllRoles>("super_admin", "admin", "user", "gridmaster");

// ── Property Tests ────────────────────────────────────────────────────────────

describe("RBAC Property Tests", () => {
  describe("Property 1: Role Change Idempotency", () => {
    /**
     * **Validates: Requirements 1.2**
     *
     * For any role change operation with a given idempotency key, calling the
     * change_user_role RPC twice with the same key should return "already_applied"
     * on the second call and leave the user's role unchanged from the first
     * successful application.
     */

    let mockSystem: ReturnType<typeof createMockRoleChangeSystem>;

    beforeEach(() => {
      mockSystem = createMockRoleChangeSystem();
    });

    it("second call with same idempotency key returns 'already_applied'", () => {
      fc.assert(
        fc.property(
          arbUuid,
          arbOrgRole,
          arbUuid,
          arbIdempotencyKey,
          (targetUserId, newRole, changedById, idempotencyKey) => {
            mockSystem.reset();

            // First call should succeed
            const firstResult = mockSystem.changeUserRole(
              targetUserId,
              newRole,
              changedById,
              idempotencyKey
            );
            expect(firstResult.status).toBe("success");

            // Second call with same idempotency key should return "already_applied"
            const secondResult = mockSystem.changeUserRole(
              targetUserId,
              newRole,
              changedById,
              idempotencyKey
            );
            expect(secondResult.status).toBe("already_applied");
          }
        ),
        { numRuns: 100 }
      );
    });

    it("user role remains unchanged after second call with same idempotency key", () => {
      fc.assert(
        fc.property(
          arbUuid,
          arbOrgRole,
          arbOrgRole,
          arbUuid,
          arbIdempotencyKey,
          (targetUserId, initialRole, newRole, changedById, idempotencyKey) => {
            mockSystem.reset();

            // Set initial role
            mockSystem.setUserRole(targetUserId, initialRole);

            // First call changes the role
            const firstResult = mockSystem.changeUserRole(
              targetUserId,
              newRole,
              changedById,
              idempotencyKey
            );
            expect(firstResult.status).toBe("success");

            // Capture role after first call
            const roleAfterFirstCall = mockSystem.getUserRole(targetUserId);

            // Second call with same idempotency key
            mockSystem.changeUserRole(
              targetUserId,
              newRole,
              changedById,
              idempotencyKey
            );

            // Role should remain unchanged from first successful application
            const roleAfterSecondCall = mockSystem.getUserRole(targetUserId);
            expect(roleAfterSecondCall).toBe(roleAfterFirstCall);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("different idempotency keys allow multiple role changes", () => {
      fc.assert(
        fc.property(
          arbUuid,
          arbOrgRole,
          arbOrgRole,
          arbUuid,
          arbIdempotencyKey,
          arbIdempotencyKey,
          (targetUserId, firstRole, secondRole, changedById, key1, key2) => {
            // Skip if keys are the same (extremely unlikely with UUIDs)
            fc.pre(key1 !== key2);

            mockSystem.reset();

            // First call with key1
            const firstResult = mockSystem.changeUserRole(
              targetUserId,
              firstRole,
              changedById,
              key1
            );
            expect(firstResult.status).toBe("success");

            // Second call with different key (key2) should also succeed
            const secondResult = mockSystem.changeUserRole(
              targetUserId,
              secondRole,
              changedById,
              key2
            );
            expect(secondResult.status).toBe("success");

            // User should have the second role
            expect(mockSystem.getUserRole(targetUserId)).toBe(secondRole);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("idempotency key uniquely identifies the operation regardless of other parameters", () => {
      fc.assert(
        fc.property(
          arbUuid,
          arbUuid,
          arbOrgRole,
          arbOrgRole,
          arbUuid,
          arbUuid,
          arbIdempotencyKey,
          (
            targetUserId1,
            targetUserId2,
            role1,
            role2,
            changedById1,
            changedById2,
            idempotencyKey
          ) => {
            mockSystem.reset();

            // First call
            const firstResult = mockSystem.changeUserRole(
              targetUserId1,
              role1,
              changedById1,
              idempotencyKey
            );
            expect(firstResult.status).toBe("success");

            // Second call with same idempotency key but different parameters
            // should still return "already_applied"
            const secondResult = mockSystem.changeUserRole(
              targetUserId2,
              role2,
              changedById2,
              idempotencyKey
            );
            expect(secondResult.status).toBe("already_applied");
          }
        ),
        { numRuns: 100 }
      );
    });

    it("audit log contains exactly one entry per idempotency key", () => {
      fc.assert(
        fc.property(
          arbUuid,
          arbOrgRole,
          arbUuid,
          arbIdempotencyKey,
          fc.integer({ min: 2, max: 5 }),
          (targetUserId, newRole, changedById, idempotencyKey, callCount) => {
            mockSystem.reset();

            // Call multiple times with the same idempotency key
            for (let i = 0; i < callCount; i++) {
              mockSystem.changeUserRole(
                targetUserId,
                newRole,
                changedById,
                idempotencyKey
              );
            }

            // Audit log should contain exactly one entry for this key
            const log = mockSystem.getRoleChangeLog();
            const entriesWithKey = log.filter(
              (entry) => entry.idempotency_key === idempotencyKey
            );
            expect(entriesWithKey).toHaveLength(1);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe("Property 2: Role Change Audit Trail", () => {
    /**
     * **Validates: Requirements 1.3, 8.3**
     *
     * For any successful role change operation, there must exist exactly one
     * corresponding record in the role_change_log table with matching
     * target_user_id, from_role, to_role, and idempotency_key.
     */

    let mockSystem: ReturnType<typeof createMockRoleChangeSystem>;

    beforeEach(() => {
      mockSystem = createMockRoleChangeSystem();
    });

    it("every successful role change creates exactly one audit log entry", () => {
      fc.assert(
        fc.property(
          arbUuid,
          arbOrgRole,
          arbUuid,
          arbIdempotencyKey,
          (targetUserId, newRole, changedById, idempotencyKey) => {
            mockSystem.reset();

            // Perform role change
            const result = mockSystem.changeUserRole(
              targetUserId,
              newRole,
              changedById,
              idempotencyKey
            );

            // Verify it was successful
            expect(result.status).toBe("success");

            // Verify exactly one audit log entry exists
            const log = mockSystem.getRoleChangeLog();
            expect(log).toHaveLength(1);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("audit log entry contains correct target_user_id", () => {
      fc.assert(
        fc.property(
          arbUuid,
          arbOrgRole,
          arbUuid,
          arbIdempotencyKey,
          (targetUserId, newRole, changedById, idempotencyKey) => {
            mockSystem.reset();

            // Perform role change
            const result = mockSystem.changeUserRole(
              targetUserId,
              newRole,
              changedById,
              idempotencyKey
            );
            expect(result.status).toBe("success");

            // Verify audit log entry has correct target_user_id
            const log = mockSystem.getRoleChangeLog();
            expect(log[0].target_user_id).toBe(targetUserId);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("audit log entry contains correct from_role and to_role", () => {
      fc.assert(
        fc.property(
          arbUuid,
          arbOrgRole,
          arbOrgRole,
          arbUuid,
          arbIdempotencyKey,
          (targetUserId, initialRole, newRole, changedById, idempotencyKey) => {
            mockSystem.reset();

            // Set initial role
            mockSystem.setUserRole(targetUserId, initialRole);

            // Perform role change
            const result = mockSystem.changeUserRole(
              targetUserId,
              newRole,
              changedById,
              idempotencyKey
            );
            expect(result.status).toBe("success");

            // Verify audit log entry has correct from_role and to_role
            const log = mockSystem.getRoleChangeLog();
            expect(log[0].from_role).toBe(initialRole);
            expect(log[0].to_role).toBe(newRole);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("audit log entry contains correct idempotency_key", () => {
      fc.assert(
        fc.property(
          arbUuid,
          arbOrgRole,
          arbUuid,
          arbIdempotencyKey,
          (targetUserId, newRole, changedById, idempotencyKey) => {
            mockSystem.reset();

            // Perform role change
            const result = mockSystem.changeUserRole(
              targetUserId,
              newRole,
              changedById,
              idempotencyKey
            );
            expect(result.status).toBe("success");

            // Verify audit log entry has correct idempotency_key
            const log = mockSystem.getRoleChangeLog();
            expect(log[0].idempotency_key).toBe(idempotencyKey);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("duplicate operations do not create additional audit entries", () => {
      fc.assert(
        fc.property(
          arbUuid,
          arbOrgRole,
          arbUuid,
          arbIdempotencyKey,
          fc.integer({ min: 2, max: 10 }),
          (targetUserId, newRole, changedById, idempotencyKey, duplicateCount) => {
            mockSystem.reset();

            // Perform initial role change
            const firstResult = mockSystem.changeUserRole(
              targetUserId,
              newRole,
              changedById,
              idempotencyKey
            );
            expect(firstResult.status).toBe("success");

            // Attempt duplicate operations with same idempotency key
            for (let i = 1; i < duplicateCount; i++) {
              const duplicateResult = mockSystem.changeUserRole(
                targetUserId,
                newRole,
                changedById,
                idempotencyKey
              );
              expect(duplicateResult.status).toBe("already_applied");
            }

            // Verify still only one audit log entry exists
            const log = mockSystem.getRoleChangeLog();
            expect(log).toHaveLength(1);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("multiple successful role changes with different keys create corresponding audit entries", () => {
      fc.assert(
        fc.property(
          arbUuid,
          fc.array(fc.tuple(arbOrgRole, arbUuid, arbIdempotencyKey), { minLength: 1, maxLength: 5 }),
          (targetUserId, roleChanges) => {
            // Ensure all idempotency keys are unique
            const keys = roleChanges.map(([, , key]) => key);
            fc.pre(new Set(keys).size === keys.length);

            mockSystem.reset();

            // Perform multiple role changes
            for (const [newRole, changedById, idempotencyKey] of roleChanges) {
              const result = mockSystem.changeUserRole(
                targetUserId,
                newRole,
                changedById,
                idempotencyKey
              );
              expect(result.status).toBe("success");
            }

            // Verify audit log has exactly one entry per successful change
            const log = mockSystem.getRoleChangeLog();
            expect(log).toHaveLength(roleChanges.length);

            // Verify each entry has matching idempotency_key
            for (const [, , idempotencyKey] of roleChanges) {
              const matchingEntry = log.find(
                (entry) => entry.idempotency_key === idempotencyKey
              );
              expect(matchingEntry).toBeDefined();
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it("audit log entry correctly tracks role transitions", () => {
      fc.assert(
        fc.property(
          arbUuid,
          fc.array(arbOrgRole, { minLength: 2, maxLength: 5 }),
          arbUuid,
          fc.array(arbIdempotencyKey, { minLength: 4, maxLength: 4 }),
          (targetUserId, roles, changedById, keys) => {
            // Ensure all keys are unique
            fc.pre(new Set(keys).size === keys.length);

            mockSystem.reset();

            // Set initial role
            mockSystem.setUserRole(targetUserId, roles[0]);

            // Perform sequential role changes and track expected transitions
            const expectedTransitions: Array<{ from: OrganizationRole; to: OrganizationRole; key: string }> = [];
            let currentRole = roles[0];

            for (let i = 1; i < roles.length && i <= keys.length; i++) {
              const newRole = roles[i];
              const key = keys[i - 1];

              const result = mockSystem.changeUserRole(
                targetUserId,
                newRole,
                changedById,
                key
              );
              expect(result.status).toBe("success");

              expectedTransitions.push({
                from: currentRole,
                to: newRole,
                key,
              });

              currentRole = newRole;
            }

            // Verify audit log correctly tracks all transitions
            const log = mockSystem.getRoleChangeLog();
            expect(log).toHaveLength(expectedTransitions.length);

            for (const expected of expectedTransitions) {
              const entry = log.find((e) => e.idempotency_key === expected.key);
              expect(entry).toBeDefined();
              expect(entry!.from_role).toBe(expected.from);
              expect(entry!.to_role).toBe(expected.to);
              expect(entry!.target_user_id).toBe(targetUserId);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe("Property 3: Admin Promotion Restriction", () => {
    /**
     * **Validates: Requirements 1.4**
     *
     * For any user with org_role='admin', attempting to change another user's role
     * to 'admin' or 'gridmaster' via change_user_role RPC should raise an exception
     * and leave the target user's role unchanged.
     */

    let mockSystem: ReturnType<typeof createMockRoleChangeSystem>;

    beforeEach(() => {
      mockSystem = createMockRoleChangeSystem();
    });

    it("admin callers cannot promote users to 'admin' role", () => {
      fc.assert(
        fc.property(
          arbUuid,
          arbUuid,
          arbOrgRole,
          arbIdempotencyKey,
          (targetUserId, adminCallerId, initialRole, idempotencyKey) => {
            mockSystem.reset();

            // Set up admin caller
            mockSystem.setCallerRole(adminCallerId, "admin");

            // Set target user's initial role
            mockSystem.setUserRole(targetUserId, initialRole);

            // Attempt to promote to admin should throw
            expect(() =>
              mockSystem.changeUserRole(
                targetUserId,
                "admin",
                adminCallerId,
                idempotencyKey
              )
            ).toThrow(AdminPromotionError);

            // Verify target user's role remains unchanged
            expect(mockSystem.getUserRole(targetUserId)).toBe(initialRole);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("admin callers cannot promote users to 'gridmaster' role", () => {
      fc.assert(
        fc.property(
          arbUuid,
          arbUuid,
          arbOrgRole,
          arbIdempotencyKey,
          (targetUserId, adminCallerId, initialRole, idempotencyKey) => {
            mockSystem.reset();

            // Set up admin caller
            mockSystem.setCallerRole(adminCallerId, "admin");

            // Set target user's initial role
            mockSystem.setUserRole(targetUserId, initialRole);

            // Attempt to promote to gridmaster should throw
            expect(() =>
              mockSystem.changeUserRole(
                targetUserId,
                "gridmaster",
                adminCallerId,
                idempotencyKey
              )
            ).toThrow(AdminPromotionError);

            // Verify target user's role remains unchanged
            expect(mockSystem.getUserRole(targetUserId)).toBe(initialRole);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("target user's role remains unchanged when admin promotion is rejected", () => {
      fc.assert(
        fc.property(
          arbUuid,
          arbUuid,
          arbOrgRole,
          arbPromotableRole,
          arbIdempotencyKey,
          (targetUserId, adminCallerId, initialRole, promotableRole, idempotencyKey) => {
            mockSystem.reset();

            // Set up admin caller
            mockSystem.setCallerRole(adminCallerId, "admin");

            // Set target user's initial role
            mockSystem.setUserRole(targetUserId, initialRole);

            // Capture role before attempted promotion
            const roleBefore = mockSystem.getUserRole(targetUserId);

            // Attempt promotion (should throw)
            try {
              mockSystem.changeUserRole(
                targetUserId,
                promotableRole,
                adminCallerId,
                idempotencyKey
              );
            } catch (e) {
              // Expected to throw
            }

            // Verify role is unchanged
            const roleAfter = mockSystem.getUserRole(targetUserId);
            expect(roleAfter).toBe(roleBefore);
            expect(roleAfter).toBe(initialRole);

            // Verify no audit log entry was created
            const log = mockSystem.getRoleChangeLog();
            expect(log).toHaveLength(0);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("gridmaster callers CAN promote users to any role including admin", () => {
      fc.assert(
        fc.property(
          arbUuid,
          arbUuid,
          arbOrgRole,
          arbAllRoles,
          arbIdempotencyKey,
          (targetUserId, gridmasterCallerId, initialRole, newRole, idempotencyKey) => {
            mockSystem.reset();

            // Set up gridmaster caller
            mockSystem.setCallerRole(gridmasterCallerId, "gridmaster");

            // Set target user's initial role
            mockSystem.setUserRole(targetUserId, initialRole);

            // Gridmaster should be able to promote to any role
            const result = mockSystem.changeUserRole(
              targetUserId,
              newRole,
              gridmasterCallerId,
              idempotencyKey
            );

            expect(result.status).toBe("success");
            expect(mockSystem.getUserRole(targetUserId)).toBe(newRole);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("admin callers CAN change users to non-promotable roles", () => {
      fc.assert(
        fc.property(
          arbUuid,
          arbUuid,
          arbOrgRole,
          arbNonPromotableOrgRole,
          arbIdempotencyKey,
          (targetUserId, adminCallerId, initialRole, newRole, idempotencyKey) => {
            mockSystem.reset();

            // Set up admin caller
            mockSystem.setCallerRole(adminCallerId, "admin");

            // Set target user's initial role
            mockSystem.setUserRole(targetUserId, initialRole);

            // Admin should be able to change to scheduler, supervisor, or user
            const result = mockSystem.changeUserRole(
              targetUserId,
              newRole,
              adminCallerId,
              idempotencyKey
            );

            expect(result.status).toBe("success");
            expect(mockSystem.getUserRole(targetUserId)).toBe(newRole);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("error message indicates admin cannot promote to admin or gridmaster", () => {
      fc.assert(
        fc.property(
          arbUuid,
          arbUuid,
          arbPromotableRole,
          arbIdempotencyKey,
          (targetUserId, adminCallerId, promotableRole, idempotencyKey) => {
            mockSystem.reset();

            // Set up admin caller
            mockSystem.setCallerRole(adminCallerId, "admin");

            // Attempt promotion should throw with specific message
            expect(() =>
              mockSystem.changeUserRole(
                targetUserId,
                promotableRole,
                adminCallerId,
                idempotencyKey
              )
            ).toThrow("admin cannot promote to admin or gridmaster");
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe("Property 22: Audit Log Immutability", () => {
    /**
     * **Validates: Requirements 8.2**
     *
     * For any record in role_change_log, UPDATE and DELETE operations should be
     * rejected by RLS policies, making the audit trail append-only.
     */

    let mockSystem: ReturnType<typeof createMockRoleChangeSystem>;

    beforeEach(() => {
      mockSystem = createMockRoleChangeSystem();
    });

    it("attempting to update an audit log entry throws RLS policy violation error", () => {
      fc.assert(
        fc.property(
          arbUuid,
          arbOrgRole,
          arbUuid,
          arbIdempotencyKey,
          arbOrgRole,
          (targetUserId, newRole, changedById, idempotencyKey, attemptedNewRole) => {
            mockSystem.reset();

            // Create an audit log entry via role change
            const result = mockSystem.changeUserRole(
              targetUserId,
              newRole,
              changedById,
              idempotencyKey
            );
            expect(result.status).toBe("success");

            // Verify audit log entry exists
            const logBefore = mockSystem.getRoleChangeLog();
            expect(logBefore).toHaveLength(1);

            // Attempt to update the audit log entry should throw RLS violation
            expect(() =>
              mockSystem.updateAuditLogEntry(idempotencyKey, {
                to_role: attemptedNewRole,
              })
            ).toThrow(RLSPolicyViolationError);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("attempting to delete an audit log entry throws RLS policy violation error", () => {
      fc.assert(
        fc.property(
          arbUuid,
          arbOrgRole,
          arbUuid,
          arbIdempotencyKey,
          (targetUserId, newRole, changedById, idempotencyKey) => {
            mockSystem.reset();

            // Create an audit log entry via role change
            const result = mockSystem.changeUserRole(
              targetUserId,
              newRole,
              changedById,
              idempotencyKey
            );
            expect(result.status).toBe("success");

            // Verify audit log entry exists
            const logBefore = mockSystem.getRoleChangeLog();
            expect(logBefore).toHaveLength(1);

            // Attempt to delete the audit log entry should throw RLS violation
            expect(() =>
              mockSystem.deleteAuditLogEntry(idempotencyKey)
            ).toThrow(RLSPolicyViolationError);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("audit log remains unchanged after failed update attempt", () => {
      fc.assert(
        fc.property(
          arbUuid,
          arbOrgRole,
          arbUuid,
          arbIdempotencyKey,
          arbOrgRole,
          arbUuid,
          (targetUserId, newRole, changedById, idempotencyKey, attemptedNewRole, attemptedNewTargetId) => {
            mockSystem.reset();

            // Create an audit log entry via role change
            const result = mockSystem.changeUserRole(
              targetUserId,
              newRole,
              changedById,
              idempotencyKey
            );
            expect(result.status).toBe("success");

            // Capture audit log state before update attempt
            const logBefore = mockSystem.getRoleChangeLog();
            const entryBefore = { ...logBefore[0] };

            // Attempt to update the audit log entry (should throw)
            try {
              mockSystem.updateAuditLogEntry(idempotencyKey, {
                to_role: attemptedNewRole,
                target_user_id: attemptedNewTargetId,
              });
            } catch (e) {
              // Expected to throw
            }

            // Verify audit log is unchanged
            const logAfter = mockSystem.getRoleChangeLog();
            expect(logAfter).toHaveLength(1);
            expect(logAfter[0].target_user_id).toBe(entryBefore.target_user_id);
            expect(logAfter[0].changed_by_id).toBe(entryBefore.changed_by_id);
            expect(logAfter[0].from_role).toBe(entryBefore.from_role);
            expect(logAfter[0].to_role).toBe(entryBefore.to_role);
            expect(logAfter[0].idempotency_key).toBe(entryBefore.idempotency_key);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("audit log remains unchanged after failed delete attempt", () => {
      fc.assert(
        fc.property(
          arbUuid,
          arbOrgRole,
          arbUuid,
          arbIdempotencyKey,
          (targetUserId, newRole, changedById, idempotencyKey) => {
            mockSystem.reset();

            // Create an audit log entry via role change
            const result = mockSystem.changeUserRole(
              targetUserId,
              newRole,
              changedById,
              idempotencyKey
            );
            expect(result.status).toBe("success");

            // Capture audit log state before delete attempt
            const logBefore = mockSystem.getRoleChangeLog();
            const entryBefore = { ...logBefore[0] };

            // Attempt to delete the audit log entry (should throw)
            try {
              mockSystem.deleteAuditLogEntry(idempotencyKey);
            } catch (e) {
              // Expected to throw
            }

            // Verify audit log is unchanged - entry still exists
            const logAfter = mockSystem.getRoleChangeLog();
            expect(logAfter).toHaveLength(1);
            expect(logAfter[0].target_user_id).toBe(entryBefore.target_user_id);
            expect(logAfter[0].changed_by_id).toBe(entryBefore.changed_by_id);
            expect(logAfter[0].from_role).toBe(entryBefore.from_role);
            expect(logAfter[0].to_role).toBe(entryBefore.to_role);
            expect(logAfter[0].idempotency_key).toBe(entryBefore.idempotency_key);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("multiple audit log entries remain intact after failed modification attempts", () => {
      fc.assert(
        fc.property(
          arbUuid,
          fc.array(fc.tuple(arbOrgRole, arbUuid, arbIdempotencyKey), { minLength: 2, maxLength: 5 }),
          (targetUserId, roleChanges) => {
            // Ensure all idempotency keys are unique
            const keys = roleChanges.map(([, , key]) => key);
            fc.pre(new Set(keys).size === keys.length);

            mockSystem.reset();

            // Create multiple audit log entries
            for (const [newRole, changedById, idempotencyKey] of roleChanges) {
              const result = mockSystem.changeUserRole(
                targetUserId,
                newRole,
                changedById,
                idempotencyKey
              );
              expect(result.status).toBe("success");
            }

            // Capture audit log state before modification attempts
            const logBefore = mockSystem.getRoleChangeLog();
            expect(logBefore).toHaveLength(roleChanges.length);

            // Attempt to update and delete each entry
            for (const [, , idempotencyKey] of roleChanges) {
              try {
                mockSystem.updateAuditLogEntry(idempotencyKey, { to_role: "user" });
              } catch (e) {
                // Expected to throw
              }

              try {
                mockSystem.deleteAuditLogEntry(idempotencyKey);
              } catch (e) {
                // Expected to throw
              }
            }

            // Verify all audit log entries remain intact
            const logAfter = mockSystem.getRoleChangeLog();
            expect(logAfter).toHaveLength(roleChanges.length);

            // Verify each entry is unchanged
            for (let i = 0; i < logBefore.length; i++) {
              expect(logAfter[i].target_user_id).toBe(logBefore[i].target_user_id);
              expect(logAfter[i].changed_by_id).toBe(logBefore[i].changed_by_id);
              expect(logAfter[i].from_role).toBe(logBefore[i].from_role);
              expect(logAfter[i].to_role).toBe(logBefore[i].to_role);
              expect(logAfter[i].idempotency_key).toBe(logBefore[i].idempotency_key);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it("error message indicates RLS policy rejection for UPDATE operations", () => {
      fc.assert(
        fc.property(
          arbUuid,
          arbOrgRole,
          arbUuid,
          arbIdempotencyKey,
          (targetUserId, newRole, changedById, idempotencyKey) => {
            mockSystem.reset();

            // Create an audit log entry
            mockSystem.changeUserRole(targetUserId, newRole, changedById, idempotencyKey);

            // Verify error message mentions RLS policy
            expect(() =>
              mockSystem.updateAuditLogEntry(idempotencyKey, { to_role: "user" })
            ).toThrow(/RLS policy/);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("error message indicates RLS policy rejection for DELETE operations", () => {
      fc.assert(
        fc.property(
          arbUuid,
          arbOrgRole,
          arbUuid,
          arbIdempotencyKey,
          (targetUserId, newRole, changedById, idempotencyKey) => {
            mockSystem.reset();

            // Create an audit log entry
            mockSystem.changeUserRole(targetUserId, newRole, changedById, idempotencyKey);

            // Verify error message mentions RLS policy
            expect(() =>
              mockSystem.deleteAuditLogEntry(idempotencyKey)
            ).toThrow(/RLS policy/);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  // ── Impersonation System Mock ─────────────────────────────────────────────────

  /**
   * Simulates the impersonation system behavior for testing.
   * This mock implements the same logic as the actual database functions.
   */
  function createMockImpersonationSystem() {
    // In-memory state to simulate database
    interface ImpersonationSession {
      session_id: string;
      gridmaster_id: string;
      target_user_id: string;
      target_org_id: string;
      expires_at: Date;
      created_at: Date;
    }

    const impersonationSessions: ImpersonationSession[] = [];
    const userProfiles: Map<string, { org_id: string; platform_role: string }> = new Map();
    const callerPlatformRoles: Map<string, string> = new Map();

    class NotGridmasterError extends Error {
      constructor(message: string) {
        super(message);
        this.name = "NotGridmasterError";
      }
    }

    class UniqueConstraintError extends Error {
      constructor(message: string) {
        super(message);
        this.name = "UniqueConstraintError";
      }
    }

    class UserNotFoundError extends Error {
      constructor(message: string) {
        super(message);
        this.name = "UserNotFoundError";
      }
    }

    /**
     * Simulates the is_gridmaster() helper function.
     */
    function isGridmaster(callerId: string): boolean {
      return callerPlatformRoles.get(callerId) === "gridmaster";
    }

    /**
     * Simulates the start_impersonation RPC function.
     * Creates an impersonation session with 30-minute expiry.
     */
    function startImpersonation(
      callerId: string,
      targetUserId: string
    ): { session_id: string; expires_at: Date; target_org_id: string } {
      // 1. Verify caller is gridmaster
      if (!isGridmaster(callerId)) {
        throw new NotGridmasterError("Only gridmaster can impersonate users");
      }

      // 2. Get target user's org_id
      const targetProfile = userProfiles.get(targetUserId);
      if (!targetProfile) {
        throw new UserNotFoundError("Target user not found");
      }
      const targetOrgId = targetProfile.org_id;

      // 3. Check for existing active session (UNIQUE constraint)
      const existingSession = impersonationSessions.find(
        (s) => s.gridmaster_id === callerId && s.target_user_id === targetUserId
      );
      if (existingSession) {
        throw new UniqueConstraintError(
          "UNIQUE constraint violation: one_active_session_per_target (gridmaster_id, target_user_id)"
        );
      }

      // 4. Create session with 30-minute expiry
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 30 * 60 * 1000); // 30 minutes
      const sessionId = crypto.randomUUID();

      const session: ImpersonationSession = {
        session_id: sessionId,
        gridmaster_id: callerId,
        target_user_id: targetUserId,
        target_org_id: targetOrgId,
        expires_at: expiresAt,
        created_at: now,
      };

      impersonationSessions.push(session);

      return {
        session_id: sessionId,
        expires_at: expiresAt,
        target_org_id: targetOrgId,
      };
    }

    /**
     * Simulates the end_impersonation RPC function.
     * Deletes the session by session_id if caller is the owning gridmaster.
     */
    function endImpersonation(callerId: string, sessionId: string): void {
      const sessionIndex = impersonationSessions.findIndex(
        (s) => s.session_id === sessionId && s.gridmaster_id === callerId
      );

      if (sessionIndex !== -1) {
        impersonationSessions.splice(sessionIndex, 1);
      }
    }

    return {
      startImpersonation,
      endImpersonation,
      isGridmaster,
      setCallerPlatformRole: (userId: string, role: string) =>
        callerPlatformRoles.set(userId, role),
      setUserProfile: (userId: string, orgId: string, platformRole: string = "none") =>
        userProfiles.set(userId, { org_id: orgId, platform_role: platformRole }),
      getSessions: () => [...impersonationSessions],
      getSessionByTargetUser: (gridmasterId: string, targetUserId: string) =>
        impersonationSessions.find(
          (s) => s.gridmaster_id === gridmasterId && s.target_user_id === targetUserId
        ),
      reset: () => {
        impersonationSessions.length = 0;
        userProfiles.clear();
        callerPlatformRoles.clear();
      },
      NotGridmasterError,
      UniqueConstraintError,
      UserNotFoundError,
    };
  }

  describe("Property 9: Impersonation Session Creation", () => {
    /**
     * **Validates: Requirements 4.1**
     *
     * For any Gridmaster user calling start_impersonation with a valid target user ID,
     * an impersonation_sessions record should be created with a unique session_id
     * and the correct target_org_id.
     */

    let mockSystem: ReturnType<typeof createMockImpersonationSystem>;

    beforeEach(() => {
      mockSystem = createMockImpersonationSystem();
    });

    it("gridmaster can create impersonation session for valid target user", () => {
      fc.assert(
        fc.property(
          arbUuid,
          arbUuid,
          arbUuid,
          (gridmasterId, targetUserId, targetOrgId) => {
            mockSystem.reset();

            // Set up gridmaster caller
            mockSystem.setCallerPlatformRole(gridmasterId, "gridmaster");

            // Set up target user with org
            mockSystem.setUserProfile(targetUserId, targetOrgId);

            // Create impersonation session
            const result = mockSystem.startImpersonation(gridmasterId, targetUserId);

            // Verify session was created
            expect(result.session_id).toBeDefined();
            expect(typeof result.session_id).toBe("string");
            expect(result.session_id.length).toBeGreaterThan(0);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("impersonation session has correct target_org_id", () => {
      fc.assert(
        fc.property(
          arbUuid,
          arbUuid,
          arbUuid,
          (gridmasterId, targetUserId, targetOrgId) => {
            mockSystem.reset();

            // Set up gridmaster caller
            mockSystem.setCallerPlatformRole(gridmasterId, "gridmaster");

            // Set up target user with specific org
            mockSystem.setUserProfile(targetUserId, targetOrgId);

            // Create impersonation session
            const result = mockSystem.startImpersonation(gridmasterId, targetUserId);

            // Verify target_org_id matches the target user's org
            expect(result.target_org_id).toBe(targetOrgId);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("each impersonation session has a unique session_id", () => {
      fc.assert(
        fc.property(
          arbUuid,
          fc.array(fc.tuple(arbUuid, arbUuid), { minLength: 2, maxLength: 5 }),
          (gridmasterId, targetUsers) => {
            // Ensure all target user IDs are unique
            const targetUserIds = targetUsers.map(([userId]) => userId);
            fc.pre(new Set(targetUserIds).size === targetUserIds.length);

            mockSystem.reset();

            // Set up gridmaster caller
            mockSystem.setCallerPlatformRole(gridmasterId, "gridmaster");

            // Set up target users with their orgs
            for (const [targetUserId, targetOrgId] of targetUsers) {
              mockSystem.setUserProfile(targetUserId, targetOrgId);
            }

            // Create impersonation sessions for each target user
            const sessionIds: string[] = [];
            for (const [targetUserId] of targetUsers) {
              const result = mockSystem.startImpersonation(gridmasterId, targetUserId);
              sessionIds.push(result.session_id);
            }

            // Verify all session IDs are unique
            expect(new Set(sessionIds).size).toBe(sessionIds.length);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("non-gridmaster users cannot create impersonation sessions", () => {
      fc.assert(
        fc.property(
          arbUuid,
          arbUuid,
          arbUuid,
          arbOrgRole,
          (callerId, targetUserId, targetOrgId, callerRole) => {
            mockSystem.reset();

            // Set up non-gridmaster caller (any org role)
            mockSystem.setCallerPlatformRole(callerId, callerRole);

            // Set up target user with org
            mockSystem.setUserProfile(targetUserId, targetOrgId);

            // Attempt to create impersonation session should throw
            expect(() =>
              mockSystem.startImpersonation(callerId, targetUserId)
            ).toThrow(mockSystem.NotGridmasterError);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("impersonation session is stored in the sessions list", () => {
      fc.assert(
        fc.property(
          arbUuid,
          arbUuid,
          arbUuid,
          (gridmasterId, targetUserId, targetOrgId) => {
            mockSystem.reset();

            // Set up gridmaster caller
            mockSystem.setCallerPlatformRole(gridmasterId, "gridmaster");

            // Set up target user with org
            mockSystem.setUserProfile(targetUserId, targetOrgId);

            // Create impersonation session
            const result = mockSystem.startImpersonation(gridmasterId, targetUserId);

            // Verify session exists in the sessions list
            const sessions = mockSystem.getSessions();
            expect(sessions).toHaveLength(1);
            expect(sessions[0].session_id).toBe(result.session_id);
            expect(sessions[0].gridmaster_id).toBe(gridmasterId);
            expect(sessions[0].target_user_id).toBe(targetUserId);
            expect(sessions[0].target_org_id).toBe(targetOrgId);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("impersonation session has 30-minute expiry", () => {
      fc.assert(
        fc.property(
          arbUuid,
          arbUuid,
          arbUuid,
          (gridmasterId, targetUserId, targetOrgId) => {
            mockSystem.reset();

            // Set up gridmaster caller
            mockSystem.setCallerPlatformRole(gridmasterId, "gridmaster");

            // Set up target user with org
            mockSystem.setUserProfile(targetUserId, targetOrgId);

            // Capture time before creating session
            const beforeCreation = new Date();

            // Create impersonation session
            const result = mockSystem.startImpersonation(gridmasterId, targetUserId);

            // Capture time after creating session
            const afterCreation = new Date();

            // Verify expires_at is approximately 30 minutes from now
            const expectedMinExpiry = new Date(beforeCreation.getTime() + 30 * 60 * 1000);
            const expectedMaxExpiry = new Date(afterCreation.getTime() + 30 * 60 * 1000);

            expect(result.expires_at.getTime()).toBeGreaterThanOrEqual(expectedMinExpiry.getTime());
            expect(result.expires_at.getTime()).toBeLessThanOrEqual(expectedMaxExpiry.getTime());
          }
        ),
        { numRuns: 100 }
      );
    });

    it("error message indicates only gridmaster can impersonate", () => {
      fc.assert(
        fc.property(
          arbUuid,
          arbUuid,
          arbUuid,
          (callerId, targetUserId, targetOrgId) => {
            mockSystem.reset();

            // Set up non-gridmaster caller
            mockSystem.setCallerPlatformRole(callerId, "none");

            // Set up target user with org
            mockSystem.setUserProfile(targetUserId, targetOrgId);

            // Verify error message
            expect(() =>
              mockSystem.startImpersonation(callerId, targetUserId)
            ).toThrow("Only gridmaster can impersonate users");
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe("Property 10: Impersonation Session Uniqueness", () => {
    /**
     * **Validates: Requirements 4.2**
     *
     * For any Gridmaster attempting to create two impersonation sessions for the same
     * target user, the second attempt should fail due to the UNIQUE constraint on
     * (gridmaster_id, target_user_id).
     */

    let mockSystem: ReturnType<typeof createMockImpersonationSystem>;

    beforeEach(() => {
      mockSystem = createMockImpersonationSystem();
    });

    it("second impersonation session for same target user fails with uniqueness error", () => {
      fc.assert(
        fc.property(
          arbUuid,
          arbUuid,
          arbUuid,
          (gridmasterId, targetUserId, targetOrgId) => {
            mockSystem.reset();

            // Set up gridmaster caller
            mockSystem.setCallerPlatformRole(gridmasterId, "gridmaster");

            // Set up target user with org
            mockSystem.setUserProfile(targetUserId, targetOrgId);

            // First impersonation session should succeed
            const firstResult = mockSystem.startImpersonation(gridmasterId, targetUserId);
            expect(firstResult.session_id).toBeDefined();

            // Second impersonation session for same target should fail
            expect(() =>
              mockSystem.startImpersonation(gridmasterId, targetUserId)
            ).toThrow(mockSystem.UniqueConstraintError);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("only one session record exists after duplicate attempt", () => {
      fc.assert(
        fc.property(
          arbUuid,
          arbUuid,
          arbUuid,
          (gridmasterId, targetUserId, targetOrgId) => {
            mockSystem.reset();

            // Set up gridmaster caller
            mockSystem.setCallerPlatformRole(gridmasterId, "gridmaster");

            // Set up target user with org
            mockSystem.setUserProfile(targetUserId, targetOrgId);

            // First impersonation session
            mockSystem.startImpersonation(gridmasterId, targetUserId);

            // Attempt second session (should fail)
            try {
              mockSystem.startImpersonation(gridmasterId, targetUserId);
            } catch (e) {
              // Expected to throw
            }

            // Verify only one session exists
            const sessions = mockSystem.getSessions();
            expect(sessions).toHaveLength(1);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("different gridmasters can impersonate the same target user", () => {
      fc.assert(
        fc.property(
          arbUuid,
          arbUuid,
          arbUuid,
          arbUuid,
          (gridmaster1Id, gridmaster2Id, targetUserId, targetOrgId) => {
            // Ensure gridmasters are different
            fc.pre(gridmaster1Id !== gridmaster2Id);

            mockSystem.reset();

            // Set up both gridmaster callers
            mockSystem.setCallerPlatformRole(gridmaster1Id, "gridmaster");
            mockSystem.setCallerPlatformRole(gridmaster2Id, "gridmaster");

            // Set up target user with org
            mockSystem.setUserProfile(targetUserId, targetOrgId);

            // First gridmaster creates session
            const result1 = mockSystem.startImpersonation(gridmaster1Id, targetUserId);
            expect(result1.session_id).toBeDefined();

            // Second gridmaster can also create session for same target
            const result2 = mockSystem.startImpersonation(gridmaster2Id, targetUserId);
            expect(result2.session_id).toBeDefined();

            // Both sessions should exist
            const sessions = mockSystem.getSessions();
            expect(sessions).toHaveLength(2);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("same gridmaster can impersonate different target users", () => {
      fc.assert(
        fc.property(
          arbUuid,
          fc.array(fc.tuple(arbUuid, arbUuid), { minLength: 2, maxLength: 5 }),
          (gridmasterId, targetUsers) => {
            // Ensure all target user IDs are unique
            const targetUserIds = targetUsers.map(([userId]) => userId);
            fc.pre(new Set(targetUserIds).size === targetUserIds.length);

            mockSystem.reset();

            // Set up gridmaster caller
            mockSystem.setCallerPlatformRole(gridmasterId, "gridmaster");

            // Set up target users with their orgs
            for (const [targetUserId, targetOrgId] of targetUsers) {
              mockSystem.setUserProfile(targetUserId, targetOrgId);
            }

            // Create impersonation sessions for each target user
            for (const [targetUserId] of targetUsers) {
              const result = mockSystem.startImpersonation(gridmasterId, targetUserId);
              expect(result.session_id).toBeDefined();
            }

            // All sessions should exist
            const sessions = mockSystem.getSessions();
            expect(sessions).toHaveLength(targetUsers.length);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("error message indicates UNIQUE constraint violation", () => {
      fc.assert(
        fc.property(
          arbUuid,
          arbUuid,
          arbUuid,
          (gridmasterId, targetUserId, targetOrgId) => {
            mockSystem.reset();

            // Set up gridmaster caller
            mockSystem.setCallerPlatformRole(gridmasterId, "gridmaster");

            // Set up target user with org
            mockSystem.setUserProfile(targetUserId, targetOrgId);

            // First impersonation session
            mockSystem.startImpersonation(gridmasterId, targetUserId);

            // Verify error message mentions UNIQUE constraint
            expect(() =>
              mockSystem.startImpersonation(gridmasterId, targetUserId)
            ).toThrow(/UNIQUE constraint/);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("after ending session, gridmaster can create new session for same target", () => {
      fc.assert(
        fc.property(
          arbUuid,
          arbUuid,
          arbUuid,
          (gridmasterId, targetUserId, targetOrgId) => {
            mockSystem.reset();

            // Set up gridmaster caller
            mockSystem.setCallerPlatformRole(gridmasterId, "gridmaster");

            // Set up target user with org
            mockSystem.setUserProfile(targetUserId, targetOrgId);

            // First impersonation session
            const firstResult = mockSystem.startImpersonation(gridmasterId, targetUserId);
            expect(firstResult.session_id).toBeDefined();

            // End the session
            mockSystem.endImpersonation(gridmasterId, firstResult.session_id);

            // Verify session was removed
            expect(mockSystem.getSessions()).toHaveLength(0);

            // Now gridmaster can create new session for same target
            const secondResult = mockSystem.startImpersonation(gridmasterId, targetUserId);
            expect(secondResult.session_id).toBeDefined();
            expect(secondResult.session_id).not.toBe(firstResult.session_id);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("first session remains unchanged after duplicate attempt fails", () => {
      fc.assert(
        fc.property(
          arbUuid,
          arbUuid,
          arbUuid,
          (gridmasterId, targetUserId, targetOrgId) => {
            mockSystem.reset();

            // Set up gridmaster caller
            mockSystem.setCallerPlatformRole(gridmasterId, "gridmaster");

            // Set up target user with org
            mockSystem.setUserProfile(targetUserId, targetOrgId);

            // First impersonation session
            const firstResult = mockSystem.startImpersonation(gridmasterId, targetUserId);

            // Capture session state before duplicate attempt
            const sessionBefore = mockSystem.getSessionByTargetUser(gridmasterId, targetUserId);

            // Attempt second session (should fail)
            try {
              mockSystem.startImpersonation(gridmasterId, targetUserId);
            } catch (e) {
              // Expected to throw
            }

            // Verify first session is unchanged
            const sessionAfter = mockSystem.getSessionByTargetUser(gridmasterId, targetUserId);
            expect(sessionAfter).toBeDefined();
            expect(sessionAfter!.session_id).toBe(sessionBefore!.session_id);
            expect(sessionAfter!.gridmaster_id).toBe(sessionBefore!.gridmaster_id);
            expect(sessionAfter!.target_user_id).toBe(sessionBefore!.target_user_id);
            expect(sessionAfter!.target_org_id).toBe(sessionBefore!.target_org_id);
            expect(sessionAfter!.expires_at.getTime()).toBe(sessionBefore!.expires_at.getTime());
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  // ── Invitation System Mock ────────────────────────────────────────────────────

  /**
   * Simulates the invitation system behavior for testing.
   * This mock implements the same logic as the actual database functions and RLS policies.
   */
  function createMockInvitationSystem() {
    // Valid roles that can be assigned via invitation
    type InvitableRole = "scheduler" | "supervisor" | "user";
    type RestrictedRole = "admin" | "gridmaster";
    type AnyRole = InvitableRole | RestrictedRole;

    interface Invitation {
      id: string;
      org_id: string;
      invited_by: string;
      email: string;
      role_to_assign: InvitableRole;
      token: string;
      expires_at: Date;
      accepted_at: Date | null;
      revoked_at: Date | null;
      created_at: Date;
    }

    const invitations: Invitation[] = [];
    const callerRoles: Map<string, OrganizationRole> = new Map();
    const callerOrgIds: Map<string, string> = new Map();

    class InvalidRoleError extends Error {
      constructor(message: string) {
        super(message);
        this.name = "InvalidRoleError";
      }
    }

    class InsufficientPermissionError extends Error {
      constructor(message: string) {
        super(message);
        this.name = "InsufficientPermissionError";
      }
    }

    /**
     * Validates that the role is one of the allowed invitable roles.
     * Admins can only invite users with roles: scheduler, supervisor, user
     * They cannot invite users with roles: admin, gridmaster
     */
    function isValidInvitableRole(role: string): role is InvitableRole {
      return ["scheduler", "supervisor", "user"].includes(role);
    }

    /**
     * Simulates the send_invitation RPC function.
     * Creates an invitation with role restriction enforcement.
     */
    function sendInvitation(
      callerId: string,
      email: string,
      roleToAssign: string,
      orgId: string
    ): { token: string; expires_at: Date; role_to_assign: string } {
      // 1. Verify caller is admin
      const callerRole = callerRoles.get(callerId);
      if (callerRole !== "admin") {
        throw new InsufficientPermissionError("Only admins can send invitations");
      }

      // 2. Verify caller belongs to the org
      const callerOrgId = callerOrgIds.get(callerId);
      if (callerOrgId !== orgId) {
        throw new InsufficientPermissionError("Cannot send invitations for other organizations");
      }

      // 3. Validate role_to_assign - this is the key restriction
      // Admins can only assign: scheduler, supervisor, user
      // Admins CANNOT assign: admin, gridmaster
      if (!isValidInvitableRole(roleToAssign)) {
        throw new InvalidRoleError(
          `Invalid role_to_assign: '${roleToAssign}'. Admins can only invite users with roles: scheduler, supervisor, user`
        );
      }

      // 4. Create invitation with 72-hour expiry
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 72 * 60 * 60 * 1000); // 72 hours
      const token = crypto.randomUUID();
      const id = crypto.randomUUID();

      const invitation: Invitation = {
        id,
        org_id: orgId,
        invited_by: callerId,
        email: email.toLowerCase(),
        role_to_assign: roleToAssign,
        token,
        expires_at: expiresAt,
        accepted_at: null,
        revoked_at: null,
        created_at: now,
      };

      invitations.push(invitation);

      return {
        token,
        expires_at: expiresAt,
        role_to_assign: roleToAssign,
      };
    }

    return {
      sendInvitation,
      isValidInvitableRole,
      setCallerRole: (userId: string, role: OrganizationRole) => callerRoles.set(userId, role),
      setCallerOrgId: (userId: string, orgId: string) => callerOrgIds.set(userId, orgId),
      getInvitations: () => [...invitations],
      getInvitationByToken: (token: string) => invitations.find((i) => i.token === token),
      reset: () => {
        invitations.length = 0;
        callerRoles.clear();
        callerOrgIds.clear();
      },
      InvalidRoleError,
      InsufficientPermissionError,
    };
  }

  // Arbitraries for invitation testing
  const arbInvitableRole = fc.constantFrom<"scheduler" | "supervisor" | "user">("scheduler", "supervisor", "user");
  const arbRestrictedRole = fc.constantFrom<"admin" | "gridmaster">("admin", "gridmaster");
  const arbEmail = fc.emailAddress();

  describe("Property 16: Invitation Role Restriction", () => {
    /**
     * **Validates: Requirements 5.6**
     *
     * For any invitation created by an Admin user, the role_to_assign must be one of
     * 'scheduler', 'supervisor', or 'user' - attempts to assign 'admin' or 'gridmaster'
     * should fail.
     */

    let mockSystem: ReturnType<typeof createMockInvitationSystem>;

    beforeEach(() => {
      mockSystem = createMockInvitationSystem();
    });

    it("admin can create invitations with role 'scheduler'", () => {
      fc.assert(
        fc.property(
          arbUuid,
          arbUuid,
          arbEmail,
          (adminId, orgId, email) => {
            mockSystem.reset();

            // Set up admin caller
            mockSystem.setCallerRole(adminId, "admin");
            mockSystem.setCallerOrgId(adminId, orgId);

            // Create invitation with scheduler role
            const result = mockSystem.sendInvitation(adminId, email, "scheduler", orgId);

            // Verify invitation was created successfully
            expect(result.token).toBeDefined();
            expect(result.role_to_assign).toBe("scheduler");
          }
        ),
        { numRuns: 100 }
      );
    });

    it("admin can create invitations with role 'supervisor'", () => {
      fc.assert(
        fc.property(
          arbUuid,
          arbUuid,
          arbEmail,
          (adminId, orgId, email) => {
            mockSystem.reset();

            // Set up admin caller
            mockSystem.setCallerRole(adminId, "admin");
            mockSystem.setCallerOrgId(adminId, orgId);

            // Create invitation with supervisor role
            const result = mockSystem.sendInvitation(adminId, email, "supervisor", orgId);

            // Verify invitation was created successfully
            expect(result.token).toBeDefined();
            expect(result.role_to_assign).toBe("supervisor");
          }
        ),
        { numRuns: 100 }
      );
    });

    it("admin can create invitations with role 'user'", () => {
      fc.assert(
        fc.property(
          arbUuid,
          arbUuid,
          arbEmail,
          (adminId, orgId, email) => {
            mockSystem.reset();

            // Set up admin caller
            mockSystem.setCallerRole(adminId, "admin");
            mockSystem.setCallerOrgId(adminId, orgId);

            // Create invitation with user role
            const result = mockSystem.sendInvitation(adminId, email, "user", orgId);

            // Verify invitation was created successfully
            expect(result.token).toBeDefined();
            expect(result.role_to_assign).toBe("user");
          }
        ),
        { numRuns: 100 }
      );
    });

    it("admin cannot create invitations with role 'admin'", () => {
      fc.assert(
        fc.property(
          arbUuid,
          arbUuid,
          arbEmail,
          (adminId, orgId, email) => {
            mockSystem.reset();

            // Set up admin caller
            mockSystem.setCallerRole(adminId, "admin");
            mockSystem.setCallerOrgId(adminId, orgId);

            // Attempt to create invitation with admin role should throw
            expect(() =>
              mockSystem.sendInvitation(adminId, email, "admin", orgId)
            ).toThrow(mockSystem.InvalidRoleError);

            // Verify no invitation was created
            expect(mockSystem.getInvitations()).toHaveLength(0);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("admin cannot create invitations with role 'gridmaster'", () => {
      fc.assert(
        fc.property(
          arbUuid,
          arbUuid,
          arbEmail,
          (adminId, orgId, email) => {
            mockSystem.reset();

            // Set up admin caller
            mockSystem.setCallerRole(adminId, "admin");
            mockSystem.setCallerOrgId(adminId, orgId);

            // Attempt to create invitation with gridmaster role should throw
            expect(() =>
              mockSystem.sendInvitation(adminId, email, "gridmaster", orgId)
            ).toThrow(mockSystem.InvalidRoleError);

            // Verify no invitation was created
            expect(mockSystem.getInvitations()).toHaveLength(0);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("invitation has correct role_to_assign value for all valid roles", () => {
      fc.assert(
        fc.property(
          arbUuid,
          arbUuid,
          arbEmail,
          arbInvitableRole,
          (adminId, orgId, email, role) => {
            mockSystem.reset();

            // Set up admin caller
            mockSystem.setCallerRole(adminId, "admin");
            mockSystem.setCallerOrgId(adminId, orgId);

            // Create invitation with the specified valid role
            const result = mockSystem.sendInvitation(adminId, email, role, orgId);

            // Verify the role_to_assign matches what was requested
            expect(result.role_to_assign).toBe(role);

            // Verify the stored invitation has the correct role
            const invitations = mockSystem.getInvitations();
            expect(invitations).toHaveLength(1);
            expect(invitations[0].role_to_assign).toBe(role);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("all restricted roles are rejected with appropriate error", () => {
      fc.assert(
        fc.property(
          arbUuid,
          arbUuid,
          arbEmail,
          arbRestrictedRole,
          (adminId, orgId, email, restrictedRole) => {
            mockSystem.reset();

            // Set up admin caller
            mockSystem.setCallerRole(adminId, "admin");
            mockSystem.setCallerOrgId(adminId, orgId);

            // Attempt to create invitation with restricted role should throw
            expect(() =>
              mockSystem.sendInvitation(adminId, email, restrictedRole, orgId)
            ).toThrow(mockSystem.InvalidRoleError);

            // Verify error message mentions the invalid role
            try {
              mockSystem.sendInvitation(adminId, email, restrictedRole, orgId);
            } catch (e) {
              expect((e as Error).message).toContain(restrictedRole);
              expect((e as Error).message).toContain("scheduler, supervisor, user");
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it("invitation system correctly distinguishes valid from invalid roles", () => {
      fc.assert(
        fc.property(
          arbUuid,
          arbUuid,
          arbEmail,
          fc.oneof(arbInvitableRole, arbRestrictedRole),
          (adminId, orgId, email, role) => {
            mockSystem.reset();

            // Set up admin caller
            mockSystem.setCallerRole(adminId, "admin");
            mockSystem.setCallerOrgId(adminId, orgId);

            const isValidRole = ["scheduler", "supervisor", "user"].includes(role);

            if (isValidRole) {
              // Valid roles should succeed
              const result = mockSystem.sendInvitation(adminId, email, role, orgId);
              expect(result.token).toBeDefined();
              expect(result.role_to_assign).toBe(role);
            } else {
              // Invalid roles should fail
              expect(() =>
                mockSystem.sendInvitation(adminId, email, role, orgId)
              ).toThrow(mockSystem.InvalidRoleError);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it("multiple valid invitations can be created with different roles", () => {
      fc.assert(
        fc.property(
          arbUuid,
          arbUuid,
          fc.array(fc.tuple(arbEmail, arbInvitableRole), { minLength: 1, maxLength: 5 }),
          (adminId, orgId, emailRolePairs) => {
            // Ensure all emails are unique
            const emails = emailRolePairs.map(([email]) => email.toLowerCase());
            fc.pre(new Set(emails).size === emails.length);

            mockSystem.reset();

            // Set up admin caller
            mockSystem.setCallerRole(adminId, "admin");
            mockSystem.setCallerOrgId(adminId, orgId);

            // Create invitations for each email/role pair
            for (const [email, role] of emailRolePairs) {
              const result = mockSystem.sendInvitation(adminId, email, role, orgId);
              expect(result.token).toBeDefined();
              expect(result.role_to_assign).toBe(role);
            }

            // Verify all invitations were created
            const invitations = mockSystem.getInvitations();
            expect(invitations).toHaveLength(emailRolePairs.length);

            // Verify each invitation has the correct role
            for (const [email, role] of emailRolePairs) {
              const invitation = invitations.find((i) => i.email === email.toLowerCase());
              expect(invitation).toBeDefined();
              expect(invitation!.role_to_assign).toBe(role);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it("no invitations are created when restricted role is attempted", () => {
      fc.assert(
        fc.property(
          arbUuid,
          arbUuid,
          arbEmail,
          arbRestrictedRole,
          (adminId, orgId, email, restrictedRole) => {
            mockSystem.reset();

            // Set up admin caller
            mockSystem.setCallerRole(adminId, "admin");
            mockSystem.setCallerOrgId(adminId, orgId);

            // Capture invitation count before attempt
            const countBefore = mockSystem.getInvitations().length;

            // Attempt to create invitation with restricted role
            try {
              mockSystem.sendInvitation(adminId, email, restrictedRole, orgId);
            } catch (e) {
              // Expected to throw
            }

            // Verify no invitation was created
            const countAfter = mockSystem.getInvitations().length;
            expect(countAfter).toBe(countBefore);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe("Property 20: Session RLS Enforcement", () => {
    /**
     * **Validates: Requirements 6.6**
     *
     * For any user querying the user_sessions table, they should only see records
     * where user_id matches their own auth.uid(), regardless of what filters they apply.
     */

    // ── Types for Session Management ────────────────────────────────────────────

    interface UserSession {
      id: string;
      user_id: string;
      device_label: string | null;
      ip_address: string | null;
      last_active_at: Date;
      created_at: Date;
      refresh_token_hash: string;
    }

    // ── Mock Implementation for Session RLS ─────────────────────────────────────

    function createMockSessionSystem() {
      // In-memory state to simulate database
      const sessions: UserSession[] = [];
      let currentAuthUid: string | null = null;

      /**
       * Sets the current authenticated user (simulates auth.uid())
       */
      function setAuthUid(userId: string | null) {
        currentAuthUid = userId;
      }

      /**
       * Creates a session for a user (bypasses RLS - admin operation)
       */
      function createSession(
        userId: string,
        deviceLabel: string | null,
        ipAddress: string | null,
        refreshTokenHash: string
      ): UserSession {
        const session: UserSession = {
          id: crypto.randomUUID(),
          user_id: userId,
          device_label: deviceLabel,
          ip_address: ipAddress,
          last_active_at: new Date(),
          created_at: new Date(),
          refresh_token_hash: refreshTokenHash,
        };
        sessions.push(session);
        return session;
      }

      /**
       * Queries sessions with RLS enforcement.
       * Simulates: SELECT * FROM user_sessions WHERE <filters>
       * RLS Policy: user_id = auth.uid()
       */
      function querySessions(filters?: {
        id?: string;
        user_id?: string;
        device_label?: string;
        refresh_token_hash?: string;
      }): UserSession[] {
        if (!currentAuthUid) {
          // No authenticated user - return empty (RLS blocks all)
          return [];
        }

        // Apply RLS policy first: user_id = auth.uid()
        let result = sessions.filter((s) => s.user_id === currentAuthUid);

        // Then apply any additional filters the user specified
        if (filters) {
          if (filters.id) {
            result = result.filter((s) => s.id === filters.id);
          }
          if (filters.user_id) {
            // User can specify user_id filter, but RLS already restricts to their own
            result = result.filter((s) => s.user_id === filters.user_id);
          }
          if (filters.device_label) {
            result = result.filter((s) => s.device_label === filters.device_label);
          }
          if (filters.refresh_token_hash) {
            result = result.filter((s) => s.refresh_token_hash === filters.refresh_token_hash);
          }
        }

        return result;
      }

      /**
       * Queries all sessions without any filter (simulates SELECT * FROM user_sessions)
       * RLS still applies, so user only sees their own sessions
       */
      function queryAllSessions(): UserSession[] {
        return querySessions();
      }

      /**
       * Attempts to query sessions for a specific user_id (trying to bypass RLS)
       * RLS should still restrict results to auth.uid() only
       */
      function querySessionsByUserId(targetUserId: string): UserSession[] {
        return querySessions({ user_id: targetUserId });
      }

      /**
       * Gets all sessions in the database (admin view, bypasses RLS)
       */
      function getAllSessionsAdmin(): UserSession[] {
        return [...sessions];
      }

      return {
        setAuthUid,
        createSession,
        querySessions,
        queryAllSessions,
        querySessionsByUserId,
        getAllSessionsAdmin,
        reset: () => {
          sessions.length = 0;
          currentAuthUid = null;
        },
      };
    }

    // ── Arbitraries ─────────────────────────────────────────────────────────────

    const arbDeviceLabel = fc.oneof(
      fc.constant(null),
      fc.constantFrom(
        "Chrome on MacOS",
        "Safari on iPhone",
        "Firefox on Windows",
        "Mobile App - Android",
        "Mobile App - iOS"
      )
    );

    const arbIpAddress = fc.oneof(
      fc.constant(null),
      fc.tuple(
        fc.integer({ min: 1, max: 255 }),
        fc.integer({ min: 0, max: 255 }),
        fc.integer({ min: 0, max: 255 }),
        fc.integer({ min: 1, max: 254 })
      ).map(([a, b, c, d]) => `${a}.${b}.${c}.${d}`)
    );

    const arbRefreshTokenHash = fc.string({ minLength: 64, maxLength: 64 }).map(s =>
      s.split('').map(c => c.charCodeAt(0).toString(16).padStart(2, '0').slice(0, 2)).join('').slice(0, 64).padEnd(64, '0')
    );

    // ── Property Tests ──────────────────────────────────────────────────────────

    let mockSystem: ReturnType<typeof createMockSessionSystem>;

    beforeEach(() => {
      mockSystem = createMockSessionSystem();
    });

    it("user can only see their own sessions when querying all sessions", () => {
      fc.assert(
        fc.property(
          arbUuid,
          arbUuid,
          fc.array(fc.tuple(arbDeviceLabel, arbIpAddress, arbRefreshTokenHash), { minLength: 1, maxLength: 5 }),
          fc.array(fc.tuple(arbDeviceLabel, arbIpAddress, arbRefreshTokenHash), { minLength: 1, maxLength: 5 }),
          (user1Id, user2Id, user1Sessions, user2Sessions) => {
            // Ensure users are different
            fc.pre(user1Id !== user2Id);

            // Ensure all refresh token hashes are unique
            const allHashes = [
              ...user1Sessions.map(([, , hash]) => hash),
              ...user2Sessions.map(([, , hash]) => hash),
            ];
            fc.pre(new Set(allHashes).size === allHashes.length);

            mockSystem.reset();

            // Create sessions for both users
            for (const [deviceLabel, ipAddress, refreshTokenHash] of user1Sessions) {
              mockSystem.createSession(user1Id, deviceLabel, ipAddress, refreshTokenHash);
            }
            for (const [deviceLabel, ipAddress, refreshTokenHash] of user2Sessions) {
              mockSystem.createSession(user2Id, deviceLabel, ipAddress, refreshTokenHash);
            }

            // User 1 queries all sessions
            mockSystem.setAuthUid(user1Id);
            const user1Results = mockSystem.queryAllSessions();

            // User 1 should only see their own sessions
            expect(user1Results).toHaveLength(user1Sessions.length);
            for (const session of user1Results) {
              expect(session.user_id).toBe(user1Id);
            }

            // User 2 queries all sessions
            mockSystem.setAuthUid(user2Id);
            const user2Results = mockSystem.queryAllSessions();

            // User 2 should only see their own sessions
            expect(user2Results).toHaveLength(user2Sessions.length);
            for (const session of user2Results) {
              expect(session.user_id).toBe(user2Id);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it("user cannot see other users' sessions even when filtering by their user_id", () => {
      fc.assert(
        fc.property(
          arbUuid,
          arbUuid,
          fc.array(fc.tuple(arbDeviceLabel, arbIpAddress, arbRefreshTokenHash), { minLength: 1, maxLength: 3 }),
          fc.array(fc.tuple(arbDeviceLabel, arbIpAddress, arbRefreshTokenHash), { minLength: 1, maxLength: 3 }),
          (attackerId, victimId, attackerSessions, victimSessions) => {
            // Ensure users are different
            fc.pre(attackerId !== victimId);

            // Ensure all refresh token hashes are unique
            const allHashes = [
              ...attackerSessions.map(([, , hash]) => hash),
              ...victimSessions.map(([, , hash]) => hash),
            ];
            fc.pre(new Set(allHashes).size === allHashes.length);

            mockSystem.reset();

            // Create sessions for both users
            for (const [deviceLabel, ipAddress, refreshTokenHash] of attackerSessions) {
              mockSystem.createSession(attackerId, deviceLabel, ipAddress, refreshTokenHash);
            }
            for (const [deviceLabel, ipAddress, refreshTokenHash] of victimSessions) {
              mockSystem.createSession(victimId, deviceLabel, ipAddress, refreshTokenHash);
            }

            // Attacker tries to query victim's sessions by specifying victim's user_id
            mockSystem.setAuthUid(attackerId);
            const attackResults = mockSystem.querySessionsByUserId(victimId);

            // RLS should block this - attacker sees nothing (victim's sessions are hidden)
            expect(attackResults).toHaveLength(0);

            // Verify victim's sessions still exist (admin view)
            const allSessions = mockSystem.getAllSessionsAdmin();
            const victimSessionsInDb = allSessions.filter((s) => s.user_id === victimId);
            expect(victimSessionsInDb).toHaveLength(victimSessions.length);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("unauthenticated users cannot see any sessions", () => {
      fc.assert(
        fc.property(
          arbUuid,
          fc.array(fc.tuple(arbDeviceLabel, arbIpAddress, arbRefreshTokenHash), { minLength: 1, maxLength: 5 }),
          (userId, userSessions) => {
            // Ensure all refresh token hashes are unique
            const hashes = userSessions.map(([, , hash]) => hash);
            fc.pre(new Set(hashes).size === hashes.length);

            mockSystem.reset();

            // Create sessions for user
            for (const [deviceLabel, ipAddress, refreshTokenHash] of userSessions) {
              mockSystem.createSession(userId, deviceLabel, ipAddress, refreshTokenHash);
            }

            // Query without authentication (auth.uid() is null)
            mockSystem.setAuthUid(null as unknown as string);
            const results = mockSystem.queryAllSessions();

            // Should see nothing
            expect(results).toHaveLength(0);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("user can filter their own sessions without affecting RLS", () => {
      fc.assert(
        fc.property(
          arbUuid,
          arbDeviceLabel,
          arbIpAddress,
          arbRefreshTokenHash,
          fc.array(fc.tuple(arbDeviceLabel, arbIpAddress, arbRefreshTokenHash), { minLength: 0, maxLength: 3 }),
          (userId, targetDeviceLabel, targetIpAddress, targetHash, otherSessions) => {
            // Ensure target hash is unique from other sessions
            const otherHashes = otherSessions.map(([, , hash]) => hash);
            fc.pre(!otherHashes.includes(targetHash));
            fc.pre(new Set(otherHashes).size === otherHashes.length);

            mockSystem.reset();

            // Create target session
            const targetSession = mockSystem.createSession(
              userId,
              targetDeviceLabel,
              targetIpAddress,
              targetHash
            );

            // Create other sessions for the same user
            for (const [deviceLabel, ipAddress, refreshTokenHash] of otherSessions) {
              mockSystem.createSession(userId, deviceLabel, ipAddress, refreshTokenHash);
            }

            // User queries with filter for specific session
            mockSystem.setAuthUid(userId);
            const results = mockSystem.querySessions({ id: targetSession.id });

            // Should find exactly the target session
            expect(results).toHaveLength(1);
            expect(results[0].id).toBe(targetSession.id);
            expect(results[0].user_id).toBe(userId);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("all sessions returned by query belong to the authenticated user", () => {
      fc.assert(
        fc.property(
          fc.array(arbUuid, { minLength: 2, maxLength: 5 }),
          fc.array(fc.tuple(arbUuid, arbDeviceLabel, arbIpAddress, arbRefreshTokenHash), { minLength: 5, maxLength: 20 }),
          (userIds, sessionData) => {
            // Ensure all user IDs are unique
            fc.pre(new Set(userIds).size === userIds.length);

            // Ensure all refresh token hashes are unique
            const hashes = sessionData.map(([, , , hash]) => hash);
            fc.pre(new Set(hashes).size === hashes.length);

            mockSystem.reset();

            // Create sessions for random users
            for (const [, deviceLabel, ipAddress, refreshTokenHash] of sessionData) {
              // Assign to a random user from our list
              const randomUserId = userIds[Math.floor(Math.random() * userIds.length)];
              mockSystem.createSession(randomUserId, deviceLabel, ipAddress, refreshTokenHash);
            }

            // For each user, verify they only see their own sessions
            for (const userId of userIds) {
              mockSystem.setAuthUid(userId);
              const results = mockSystem.queryAllSessions();

              // Every returned session must belong to the authenticated user
              for (const session of results) {
                expect(session.user_id).toBe(userId);
              }
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it("RLS prevents cross-user session access regardless of filter combination", () => {
      fc.assert(
        fc.property(
          arbUuid,
          arbUuid,
          arbDeviceLabel,
          arbIpAddress,
          arbRefreshTokenHash,
          (attackerId, victimId, deviceLabel, ipAddress, refreshTokenHash) => {
            // Ensure users are different
            fc.pre(attackerId !== victimId);

            mockSystem.reset();

            // Create a session for the victim
            const victimSession = mockSystem.createSession(
              victimId,
              deviceLabel,
              ipAddress,
              refreshTokenHash
            );

            // Attacker tries various filter combinations to access victim's session
            mockSystem.setAuthUid(attackerId);

            // Try by session ID
            const byId = mockSystem.querySessions({ id: victimSession.id });
            expect(byId).toHaveLength(0);

            // Try by user_id
            const byUserId = mockSystem.querySessions({ user_id: victimId });
            expect(byUserId).toHaveLength(0);

            // Try by refresh_token_hash
            const byHash = mockSystem.querySessions({ refresh_token_hash: refreshTokenHash });
            expect(byHash).toHaveLength(0);

            // Try by device_label (if not null)
            if (deviceLabel) {
              const byDevice = mockSystem.querySessions({ device_label: deviceLabel });
              expect(byDevice).toHaveLength(0);
            }

            // Verify victim can still access their own session
            mockSystem.setAuthUid(victimId);
            const victimResults = mockSystem.querySessions({ id: victimSession.id });
            expect(victimResults).toHaveLength(1);
            expect(victimResults[0].id).toBe(victimSession.id);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});


// ── Property 24: usePermissions Hook Correctness ──────────────────────────────

/**
 * Mock Session type for testing getPermissionsFromSession
 */
interface MockSession {
  user: {
    app_metadata: {
      platform_role?: string;
      org_role?: string;
      org_id?: string;
    };
  };
}

/**
 * Pure function implementation matching src/hooks/usePermissions.ts
 * This is duplicated here to test the logic independently.
 */
const ROLE_LEVEL: Record<string, number> = {
  gridmaster: 4,
  admin: 3,
  scheduler: 2,
  supervisor: 1,
  user: 0,
};

interface Permissions {
  role: string;
  orgId: string | null;
  level: number;
  isGridmaster: boolean;
  canManageOrg: boolean;
  canEditShifts: boolean;
  canEditNotes: boolean;
  canViewSchedule: boolean;
  atLeast: (role: string) => boolean;
}

function getPermissionsFromSession(session: MockSession | null): Permissions {
  const claims = session?.user?.app_metadata ?? {};
  const role = (claims.org_role as string) ?? "user";
  const platformRole = claims.platform_role as string;
  const orgId = (claims.org_id as string) ?? null;

  const effectiveRole = platformRole === "gridmaster" ? "gridmaster" : role;
  const level = ROLE_LEVEL[effectiveRole] ?? 0;

  return {
    role: effectiveRole,
    orgId,
    level,
    isGridmaster: level >= 4,
    canManageOrg: level >= 3,
    canEditShifts: level >= 2,
    canEditNotes: level >= 1,
    canViewSchedule: level >= 0,
    atLeast: (r: string) => level >= (ROLE_LEVEL[r] ?? 0),
  };
}

// ── Arbitraries for Property 24 ───────────────────────────────────────────────

const arbPlatformRole = fc.constantFrom("gridmaster", "none", undefined);
const arbOrgRoleForPermissions = fc.constantFrom("admin", "scheduler", "supervisor", "user", undefined);
const arbOrgId = fc.oneof(fc.uuid(), fc.constant(undefined));
const arbRoleForAtLeast = fc.constantFrom("gridmaster", "admin", "scheduler", "supervisor", "user");

/**
 * Arbitrary for generating mock JWT sessions with various role combinations
 */
const arbMockSession = fc.record({
  user: fc.record({
    app_metadata: fc.record({
      platform_role: arbPlatformRole,
      org_role: arbOrgRoleForPermissions,
      org_id: arbOrgId,
    }),
  }),
});

describe("Property 24: usePermissions Hook Correctness", () => {
  /**
   * **Validates: Requirements 9.2, 9.3**
   *
   * For any JWT claims containing platform_role and org_role, the usePermissions hook
   * should return correct boolean values for isGridmaster, canManageOrg, canEditShifts,
   * canEditNotes based on the role hierarchy, and atLeast(role) should return true if and
   * only if the user's level is >= the specified role's level.
   *
   * Role hierarchy:
   * - gridmaster: level 4
   * - admin: level 3
   * - scheduler: level 2
   * - supervisor: level 1
   * - user: level 0
   */

  it("isGridmaster is true if and only if level >= 4", () => {
    fc.assert(
      fc.property(arbMockSession, (session) => {
        const permissions = getPermissionsFromSession(session);

        // isGridmaster should be true only when level >= 4 (gridmaster)
        const expectedIsGridmaster = permissions.level >= 4;
        expect(permissions.isGridmaster).toBe(expectedIsGridmaster);
      }),
      { numRuns: 100 }
    );
  });

  it("canManageOrg is true if and only if level >= 3", () => {
    fc.assert(
      fc.property(arbMockSession, (session) => {
        const permissions = getPermissionsFromSession(session);

        // canManageOrg should be true when level >= 3 (admin or gridmaster)
        const expectedCanManageOrg = permissions.level >= 3;
        expect(permissions.canManageOrg).toBe(expectedCanManageOrg);
      }),
      { numRuns: 100 }
    );
  });

  it("canEditShifts is true if and only if level >= 2", () => {
    fc.assert(
      fc.property(arbMockSession, (session) => {
        const permissions = getPermissionsFromSession(session);

        // canEditShifts should be true when level >= 2 (scheduler, admin, or gridmaster)
        const expectedCanEditSchedule = permissions.level >= 2;
        expect(permissions.canEditShifts).toBe(expectedCanEditSchedule);
      }),
      { numRuns: 100 }
    );
  });

  it("canEditNotes is true if and only if level >= 1", () => {
    fc.assert(
      fc.property(arbMockSession, (session) => {
        const permissions = getPermissionsFromSession(session);

        // canEditNotes should be true when level >= 1 (supervisor, scheduler, admin, or gridmaster)
        const expectedCanAddNotes = permissions.level >= 1;
        expect(permissions.canEditNotes).toBe(expectedCanAddNotes);
      }),
      { numRuns: 100 }
    );
  });

  it("canViewSchedule is always true (level >= 0)", () => {
    fc.assert(
      fc.property(arbMockSession, (session) => {
        const permissions = getPermissionsFromSession(session);

        // canViewSchedule should always be true since all roles have level >= 0
        expect(permissions.canViewSchedule).toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  it("atLeast(role) returns true if and only if user level >= role level", () => {
    fc.assert(
      fc.property(arbMockSession, arbRoleForAtLeast, (session, targetRole) => {
        const permissions = getPermissionsFromSession(session);
        const targetLevel = ROLE_LEVEL[targetRole] ?? 0;

        // atLeast should return true when user's level >= target role's level
        const expectedResult = permissions.level >= targetLevel;
        expect(permissions.atLeast(targetRole)).toBe(expectedResult);
      }),
      { numRuns: 100 }
    );
  });

  it("platform_role=gridmaster overrides org_role to give level 4", () => {
    fc.assert(
      fc.property(arbOrgRoleForPermissions, arbOrgId, (orgRole, orgId) => {
        const session: MockSession = {
          user: {
            app_metadata: {
              platform_role: "gridmaster",
              org_role: orgRole,
              org_id: orgId,
            },
          },
        };

        const permissions = getPermissionsFromSession(session);

        // When platform_role is gridmaster, effective role should be gridmaster
        expect(permissions.role).toBe("gridmaster");
        expect(permissions.level).toBe(4);
        expect(permissions.isGridmaster).toBe(true);
        expect(permissions.canManageOrg).toBe(true);
        expect(permissions.canEditShifts).toBe(true);
        expect(permissions.canEditNotes).toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  it("non-gridmaster platform_role uses org_role for level calculation", () => {
    fc.assert(
      fc.property(
        fc.constantFrom("none", undefined),
        fc.constantFrom("admin", "scheduler", "supervisor", "user"),
        arbOrgId,
        (platformRole, orgRole, orgId) => {
          const session: MockSession = {
            user: {
              app_metadata: {
                platform_role: platformRole,
                org_role: orgRole,
                org_id: orgId,
              },
            },
          };

          const permissions = getPermissionsFromSession(session);
          const expectedLevel = ROLE_LEVEL[orgRole] ?? 0;

          // When platform_role is not gridmaster, org_role determines the level
          expect(permissions.role).toBe(orgRole);
          expect(permissions.level).toBe(expectedLevel);
        }
      ),
      { numRuns: 100 }
    );
  });

  it("missing claims default to user level (0)", () => {
    fc.assert(
      fc.property(fc.constant(null), () => {
        const permissions = getPermissionsFromSession(null);

        // Null session should default to user level
        expect(permissions.role).toBe("user");
        expect(permissions.level).toBe(0);
        expect(permissions.isGridmaster).toBe(false);
        expect(permissions.canManageOrg).toBe(false);
        expect(permissions.canEditShifts).toBe(false);
        expect(permissions.canEditNotes).toBe(false);
        expect(permissions.canViewSchedule).toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  it("missing org_role defaults to user level", () => {
    fc.assert(
      fc.property(
        fc.constantFrom("none", undefined),
        arbOrgId,
        (platformRole, orgId) => {
          const session: MockSession = {
            user: {
              app_metadata: {
                platform_role: platformRole,
                org_id: orgId,
                // org_role is undefined
              },
            },
          };

          const permissions = getPermissionsFromSession(session);

          // Missing org_role should default to "user"
          expect(permissions.role).toBe("user");
          expect(permissions.level).toBe(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  it("orgId is correctly extracted from claims", () => {
    fc.assert(
      fc.property(arbMockSession, (session) => {
        const permissions = getPermissionsFromSession(session);
        const expectedOrgId = session.user.app_metadata.org_id ?? null;

        expect(permissions.orgId).toBe(expectedOrgId);
      }),
      { numRuns: 100 }
    );
  });

  it("boolean helpers are consistent with level", () => {
    fc.assert(
      fc.property(arbMockSession, (session) => {
        const permissions = getPermissionsFromSession(session);

        // All boolean helpers should be consistent with the level
        expect(permissions.isGridmaster).toBe(permissions.level >= 4);
        expect(permissions.canManageOrg).toBe(permissions.level >= 3);
        expect(permissions.canEditShifts).toBe(permissions.level >= 2);
        expect(permissions.canEditNotes).toBe(permissions.level >= 1);
        expect(permissions.canViewSchedule).toBe(permissions.level >= 0);
      }),
      { numRuns: 100 }
    );
  });

  it("atLeast is consistent across all role comparisons", () => {
    fc.assert(
      fc.property(arbMockSession, (session) => {
        const permissions = getPermissionsFromSession(session);

        // Test atLeast for all roles
        expect(permissions.atLeast("gridmaster")).toBe(permissions.level >= 4);
        expect(permissions.atLeast("admin")).toBe(permissions.level >= 3);
        expect(permissions.atLeast("scheduler")).toBe(permissions.level >= 2);
        expect(permissions.atLeast("supervisor")).toBe(permissions.level >= 1);
        expect(permissions.atLeast("user")).toBe(permissions.level >= 0);
      }),
      { numRuns: 100 }
    );
  });

  it("atLeast returns true for unknown roles (defaults to level 0)", () => {
    // List of Object prototype properties to exclude from testing
    const objectPrototypeProps = Object.getOwnPropertyNames(Object.prototype);
    const knownRoles = ["gridmaster", "admin", "scheduler", "supervisor", "user"];
    const excludedStrings = [...objectPrototypeProps, ...knownRoles];

    fc.assert(
      fc.property(
        arbMockSession,
        fc.string({ minLength: 1, maxLength: 20 }).filter(s => !excludedStrings.includes(s)),
        (session, unknownRole) => {
          const permissions = getPermissionsFromSession(session);

          // Unknown roles default to level 0, so atLeast should return true
          // since all users have level >= 0
          expect(permissions.atLeast(unknownRole)).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  it("role hierarchy is strictly ordered", () => {
    fc.assert(
      fc.property(arbMockSession, (session) => {
        const permissions = getPermissionsFromSession(session);

        // If a higher permission is true, all lower permissions must also be true
        if (permissions.isGridmaster) {
          expect(permissions.canManageOrg).toBe(true);
          expect(permissions.canEditShifts).toBe(true);
          expect(permissions.canEditNotes).toBe(true);
          expect(permissions.canViewSchedule).toBe(true);
        }

        if (permissions.canManageOrg) {
          expect(permissions.canEditShifts).toBe(true);
          expect(permissions.canEditNotes).toBe(true);
          expect(permissions.canViewSchedule).toBe(true);
        }

        if (permissions.canEditShifts) {
          expect(permissions.canEditNotes).toBe(true);
          expect(permissions.canViewSchedule).toBe(true);
        }

        if (permissions.canEditNotes) {
          expect(permissions.canViewSchedule).toBe(true);
        }
      }),
      { numRuns: 100 }
    );
  });
});


// ── Property 25: Role Change Idempotency Key Uniqueness ───────────────────────

import { generateIdempotencyKey } from "../hooks/useRoleChange";

/**
 * UUID v4 format regex pattern
 * Format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
 * where x is any hex digit and y is one of 8, 9, a, or b
 */
const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe("Property 25: Role Change Idempotency Key Uniqueness", () => {
  /**
   * **Validates: Requirements 10.3**
   *
   * For any two role change mutation calls, each should generate a distinct
   * idempotency key (UUID), ensuring no accidental duplicate submissions.
   */

  it("generateIdempotencyKey produces valid UUID v4 format", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 100 }), (_iteration) => {
        const key = generateIdempotencyKey();

        // Verify the key matches UUID v4 format
        expect(key).toMatch(UUID_V4_REGEX);
      }),
      { numRuns: 100 }
    );
  });

  it("each call to generateIdempotencyKey produces a unique key", () => {
    fc.assert(
      fc.property(fc.integer({ min: 2, max: 50 }), (count) => {
        const keys: string[] = [];

        // Generate multiple keys
        for (let i = 0; i < count; i++) {
          keys.push(generateIdempotencyKey());
        }

        // All keys should be unique
        const uniqueKeys = new Set(keys);
        expect(uniqueKeys.size).toBe(count);
      }),
      { numRuns: 100 }
    );
  });

  it("two consecutive calls never produce the same key", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 100 }), (_iteration) => {
        const key1 = generateIdempotencyKey();
        const key2 = generateIdempotencyKey();

        // Keys should be different
        expect(key1).not.toBe(key2);
      }),
      { numRuns: 100 }
    );
  });

  it("large batch of keys are all distinct", () => {
    fc.assert(
      fc.property(fc.constant(100), (batchSize) => {
        const keys: string[] = [];

        // Generate a large batch of keys
        for (let i = 0; i < batchSize; i++) {
          keys.push(generateIdempotencyKey());
        }

        // All keys should be unique
        const uniqueKeys = new Set(keys);
        expect(uniqueKeys.size).toBe(batchSize);

        // All keys should be valid UUIDs
        for (const key of keys) {
          expect(key).toMatch(UUID_V4_REGEX);
        }
      }),
      { numRuns: 100 }
    );
  });

  it("keys have correct UUID structure (36 characters with hyphens)", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 100 }), (_iteration) => {
        const key = generateIdempotencyKey();

        // UUID should be 36 characters (32 hex + 4 hyphens)
        expect(key.length).toBe(36);

        // Hyphens should be at correct positions (8, 13, 18, 23)
        expect(key[8]).toBe("-");
        expect(key[13]).toBe("-");
        expect(key[18]).toBe("-");
        expect(key[23]).toBe("-");
      }),
      { numRuns: 100 }
    );
  });

  it("keys are lowercase hex strings", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 100 }), (_iteration) => {
        const key = generateIdempotencyKey();

        // Remove hyphens and check all characters are valid lowercase hex
        const hexPart = key.replace(/-/g, "");
        expect(hexPart).toMatch(/^[0-9a-f]{32}$/);
      }),
      { numRuns: 100 }
    );
  });
});


// ── Property 27: Middleware Route Protection ──────────────────────────────────

import { calculateEffectiveRole, getRoleLevel } from "../../middleware";

/**
 * Simulates the middleware route protection logic.
 * This is a pure function that determines the redirect destination based on
 * the user's role level and the requested path.
 *
 * @param roleLevel - The numeric level of the user's role
 * @param pathname - The requested path
 * @returns The redirect destination, or null if access is allowed
 */
function simulateRouteProtection(
  roleLevel: number,
  pathname: string
): string | null {
  // Staff page: requires admin+ (level >= 2)
  if (pathname.startsWith("/staff") && roleLevel < 2) {
    return "/schedule";
  }

  // Settings page: requires admin+ (level >= 2)
  if (pathname.startsWith("/settings") && roleLevel < 2) {
    return "/schedule";
  }

  // Access allowed
  return null;
}

describe("Property 27: Middleware Route Protection", () => {
  /**
   * **Validates: Requirements 11.2, 11.3**
   *
   * For any request to /staff or /settings routes, users with role level < 2 (admin)
   * should be redirected to /schedule.
   */

  // Arbitraries for JWT claims
  const arbPlatformRole = fc.constantFrom("gridmaster", "none", undefined);
  const arbOrgRole = fc.constantFrom("super_admin", "admin", "user", undefined);
  const arbOrgId = fc.option(fc.uuid(), { nil: undefined });

  // Arbitrary for settings paths
  const arbSettingsPath = fc.oneof(
    fc.constant("/settings"),
    fc.constant("/settings/"),
    fc.constant("/settings/profile"),
    fc.constant("/settings/billing"),
    fc.constant("/settings/team"),
    fc.stringMatching(/^\/settings\/[a-z]+$/)
  );

  // Arbitrary for schedule paths
  const arbSchedulePath = fc.oneof(
    fc.constant("/schedule"),
    fc.constant("/schedule/"),
    fc.constant("/schedule/week"),
    fc.constant("/schedule/month"),
    fc.constant("/schedule/day"),
    fc.stringMatching(/^\/schedule\/[a-z]+$/)
  );

  // Arbitrary for staff paths
  const arbStaffPath = fc.oneof(
    fc.constant("/staff"),
    fc.constant("/staff/"),
    fc.stringMatching(/^\/staff\/[a-z]+$/)
  );

  // Arbitrary for non-protected paths
  const arbNonProtectedPath = fc.oneof(
    fc.constant("/schedule"),
    fc.constant("/profile"),
    fc.constant("/home"),
    fc.constant("/")
  );

  // Arbitrary for JWT claims
  const arbJWTClaims = fc.record({
    platform_role: arbPlatformRole,
    org_role: arbOrgRole,
    org_id: arbOrgId,
  });

  describe("calculateEffectiveRole helper function", () => {
    it("returns 'gridmaster' when platform_role is 'gridmaster'", () => {
      fc.assert(
        fc.property(arbOrgRole, arbOrgId, (orgRole, orgId) => {
          const claims = {
            platform_role: "gridmaster",
            org_role: orgRole,
            org_id: orgId,
          };

          const effectiveRole = calculateEffectiveRole(claims);
          expect(effectiveRole).toBe("gridmaster");
        }),
        { numRuns: 100 }
      );
    });

    it("returns org_role when platform_role is not 'gridmaster'", () => {
      fc.assert(
        fc.property(
          fc.constantFrom("none", undefined),
          fc.constantFrom("super_admin", "admin", "user"),
          arbOrgId,
          (platformRole, orgRole, orgId) => {
            const claims = {
              platform_role: platformRole,
              org_role: orgRole,
              org_id: orgId,
            };

            const effectiveRole = calculateEffectiveRole(claims);
            expect(effectiveRole).toBe(orgRole);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("defaults to 'user' when org_role is undefined and platform_role is not 'gridmaster'", () => {
      fc.assert(
        fc.property(
          fc.constantFrom("none", undefined),
          arbOrgId,
          (platformRole, orgId) => {
            const claims = {
              platform_role: platformRole,
              org_role: undefined,
              org_id: orgId,
            };

            const effectiveRole = calculateEffectiveRole(claims);
            expect(effectiveRole).toBe("user");
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe("getRoleLevel helper function", () => {
    it("returns correct level for all known roles", () => {
      fc.assert(
        fc.property(fc.integer({ min: 1, max: 100 }), (_iteration) => {
          expect(getRoleLevel("gridmaster")).toBe(4);
          expect(getRoleLevel("super_admin")).toBe(3);
          expect(getRoleLevel("admin")).toBe(2);
          expect(getRoleLevel("user")).toBe(0);
        }),
        { numRuns: 100 }
      );
    });

    it("returns 0 for unknown roles", () => {
      // List of Object prototype properties to exclude from testing
      const objectPrototypeProps = Object.getOwnPropertyNames(Object.prototype);
      const knownRoles = ["gridmaster", "super_admin", "admin", "user"];
      const excludedStrings = [...objectPrototypeProps, ...knownRoles];

      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 20 }).filter(s => !excludedStrings.includes(s)),
          (unknownRole) => {
            expect(getRoleLevel(unknownRole)).toBe(0);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe("/settings route protection", () => {
    it("users with level < 2 are redirected from /settings to /schedule", () => {
      fc.assert(
        fc.property(
          fc.constantFrom("user"),
          arbSettingsPath,
          (orgRole, settingsPath) => {
            const claims = {
              platform_role: "none" as const,
              org_role: orgRole,
              org_id: "test-org-id",
            };

            const effectiveRole = calculateEffectiveRole(claims);
            const level = getRoleLevel(effectiveRole);

            // Verify level is < 2
            expect(level).toBeLessThan(2);

            // Verify redirect to /schedule
            const redirect = simulateRouteProtection(level, settingsPath);
            expect(redirect).toBe("/schedule");
          }
        ),
        { numRuns: 100 }
      );
    });

    it("users with level >= 2 can access /settings routes", () => {
      fc.assert(
        fc.property(
          fc.constantFrom("admin", "super_admin", "gridmaster"),
          arbSettingsPath,
          (role, settingsPath) => {
            const claims =
              role === "gridmaster"
                ? { platform_role: "gridmaster", org_role: undefined, org_id: "test-org-id" }
                : { platform_role: "none", org_role: role, org_id: "test-org-id" };

            const effectiveRole = calculateEffectiveRole(claims);
            const level = getRoleLevel(effectiveRole);

            // Verify level is >= 2
            expect(level).toBeGreaterThanOrEqual(2);

            // Verify no redirect (access allowed)
            const redirect = simulateRouteProtection(level, settingsPath);
            expect(redirect).toBeNull();
          }
        ),
        { numRuns: 100 }
      );
    });

    it("gridmaster can always access /settings routes", () => {
      fc.assert(
        fc.property(arbOrgRole, arbSettingsPath, (orgRole, settingsPath) => {
          const claims = {
            platform_role: "gridmaster",
            org_role: orgRole,
            org_id: "test-org-id",
          };

          const effectiveRole = calculateEffectiveRole(claims);
          const level = getRoleLevel(effectiveRole);

          // Gridmaster should have level 4
          expect(level).toBe(4);

          // Verify no redirect (access allowed)
          const redirect = simulateRouteProtection(level, settingsPath);
          expect(redirect).toBeNull();
        }),
        { numRuns: 100 }
      );
    });
  });

  describe("/staff route protection", () => {
    it("users with level < 2 are redirected from /staff to /schedule", () => {
      fc.assert(
        fc.property(
          fc.constantFrom("user"),
          arbStaffPath,
          (orgRole, staffPath) => {
            const claims = {
              platform_role: "none" as const,
              org_role: orgRole,
              org_id: "test-org-id",
            };

            const effectiveRole = calculateEffectiveRole(claims);
            const level = getRoleLevel(effectiveRole);

            // Verify level is < 2
            expect(level).toBeLessThan(2);

            // Verify redirect to /schedule
            const redirect = simulateRouteProtection(level, staffPath);
            expect(redirect).toBe("/schedule");
          }
        ),
        { numRuns: 100 }
      );
    });

    it("users with level >= 2 can access /staff routes", () => {
      fc.assert(
        fc.property(
          fc.constantFrom("admin", "super_admin", "gridmaster"),
          arbStaffPath,
          (role, staffPath) => {
            const claims =
              role === "gridmaster"
                ? { platform_role: "gridmaster", org_role: undefined, org_id: "test-org-id" }
                : { platform_role: "none", org_role: role, org_id: "test-org-id" };

            const effectiveRole = calculateEffectiveRole(claims);
            const level = getRoleLevel(effectiveRole);

            // Verify level is >= 2
            expect(level).toBeGreaterThanOrEqual(2);

            // Verify no redirect (access allowed)
            const redirect = simulateRouteProtection(level, staffPath);
            expect(redirect).toBeNull();
          }
        ),
        { numRuns: 100 }
      );
    });

    it("gridmaster can always access /staff routes", () => {
      fc.assert(
        fc.property(arbOrgRole, arbStaffPath, (orgRole, staffPath) => {
          const claims = {
            platform_role: "gridmaster",
            org_role: orgRole,
            org_id: "test-org-id",
          };

          const effectiveRole = calculateEffectiveRole(claims);
          const level = getRoleLevel(effectiveRole);

          // Gridmaster should have level 4
          expect(level).toBe(4);

          // Verify no redirect (access allowed)
          const redirect = simulateRouteProtection(level, staffPath);
          expect(redirect).toBeNull();
        }),
        { numRuns: 100 }
      );
    });
  });

  describe("non-protected routes", () => {
    it("all users can access non-protected routes", () => {
      fc.assert(
        fc.property(arbJWTClaims, arbNonProtectedPath, (claims, path) => {
          const effectiveRole = calculateEffectiveRole(claims);
          const level = getRoleLevel(effectiveRole);

          // Non-protected routes should not trigger redirects
          const redirect = simulateRouteProtection(level, path);
          expect(redirect).toBeNull();
        }),
        { numRuns: 100 }
      );
    });
  });

  describe("role level boundaries", () => {
    it("level 2 (admin) can access /settings, /staff, and /schedule", () => {
      fc.assert(
        fc.property(arbSettingsPath, arbStaffPath, (settingsPath, staffPath) => {
          const level = 2; // admin level

          // Should be able to access /settings
          const settingsRedirect = simulateRouteProtection(level, settingsPath);
          expect(settingsRedirect).toBeNull();

          // Should be able to access /staff
          const staffRedirect = simulateRouteProtection(level, staffPath);
          expect(staffRedirect).toBeNull();

          // Should be able to access /schedule
          const scheduleRedirect = simulateRouteProtection(level, "/schedule");
          expect(scheduleRedirect).toBeNull();
        }),
        { numRuns: 100 }
      );
    });

    it("level 3 (super_admin) can access /settings, /staff, and /schedule", () => {
      fc.assert(
        fc.property(arbSettingsPath, arbStaffPath, (settingsPath, staffPath) => {
          const level = 3; // super_admin level

          const settingsRedirect = simulateRouteProtection(level, settingsPath);
          expect(settingsRedirect).toBeNull();

          const staffRedirect = simulateRouteProtection(level, staffPath);
          expect(staffRedirect).toBeNull();

          const scheduleRedirect = simulateRouteProtection(level, "/schedule");
          expect(scheduleRedirect).toBeNull();
        }),
        { numRuns: 100 }
      );
    });

    it("level 0 (user) cannot access /settings or /staff but can access /schedule", () => {
      fc.assert(
        fc.property(arbSettingsPath, arbStaffPath, (settingsPath, staffPath) => {
          const level = 0; // user level

          // Should be redirected from /settings
          const settingsRedirect = simulateRouteProtection(level, settingsPath);
          expect(settingsRedirect).toBe("/schedule");

          // Should be redirected from /staff
          const staffRedirect = simulateRouteProtection(level, staffPath);
          expect(staffRedirect).toBe("/schedule");

          // Should be able to access /schedule
          const scheduleRedirect = simulateRouteProtection(level, "/schedule");
          expect(scheduleRedirect).toBeNull();
        }),
        { numRuns: 100 }
      );
    });
  });

  describe("end-to-end role to route access", () => {
    it("correctly determines access for any role and path combination", () => {
      fc.assert(
        fc.property(
          arbJWTClaims,
          fc.oneof(arbSettingsPath, arbStaffPath, arbNonProtectedPath),
          (claims, path) => {
            const effectiveRole = calculateEffectiveRole(claims);
            const level = getRoleLevel(effectiveRole);
            const redirect = simulateRouteProtection(level, path);

            // Verify the redirect logic is consistent
            if (path.startsWith("/staff")) {
              if (level < 2) {
                expect(redirect).toBe("/schedule");
              } else {
                expect(redirect).toBeNull();
              }
            } else if (path.startsWith("/settings")) {
              if (level < 2) {
                expect(redirect).toBe("/schedule");
              } else {
                expect(redirect).toBeNull();
              }
            } else {
              expect(redirect).toBeNull();
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});


// ── Property 28: Middleware Header Injection ──────────────────────────────────

/**
 * Simulates the middleware header injection logic.
 * This is a pure function that determines what headers would be set
 * based on the JWT claims.
 *
 * @param claims - JWT claims containing role and org information
 * @returns Object with the header values that would be injected
 */
function simulateHeaderInjection(claims: {
  platform_role?: string;
  org_role?: string;
  org_id?: string | undefined;
}): { role: string; orgId: string } {
  const effectiveRole = calculateEffectiveRole(claims);
  const orgId = claims.org_id ?? "";

  return {
    role: effectiveRole,
    orgId: orgId,
  };
}

describe("Property 28: Middleware Header Injection", () => {
  /**
   * **Validates: Requirements 11.5**
   *
   * For any authenticated request that passes middleware validation,
   * the response should include x-dubgrid-role and x-dubgrid-org-id headers
   * with the correct values from the JWT claims.
   */

  // Arbitraries for JWT claims
  const arbPlatformRole = fc.constantFrom("gridmaster", "none", undefined);
  const arbOrgRole = fc.constantFrom("super_admin", "admin", "user", undefined);
  const arbOrgId = fc.option(fc.uuid(), { nil: undefined });

  // Arbitrary for JWT claims
  const arbJWTClaims = fc.record({
    platform_role: arbPlatformRole,
    org_role: arbOrgRole,
    org_id: arbOrgId,
  });

  describe("x-dubgrid-role header injection", () => {
    it("header value matches the calculated effective role", () => {
      fc.assert(
        fc.property(arbJWTClaims, (claims) => {
          const expectedEffectiveRole = calculateEffectiveRole(claims);
          const headers = simulateHeaderInjection(claims);

          expect(headers.role).toBe(expectedEffectiveRole);
        }),
        { numRuns: 100 }
      );
    });

    it("header is 'gridmaster' when platform_role is 'gridmaster'", () => {
      fc.assert(
        fc.property(arbOrgRole, arbOrgId, (orgRole, orgId) => {
          const claims = {
            platform_role: "gridmaster",
            org_role: orgRole,
            org_id: orgId,
          };

          const headers = simulateHeaderInjection(claims);
          expect(headers.role).toBe("gridmaster");
        }),
        { numRuns: 100 }
      );
    });

    it("header matches org_role when platform_role is not 'gridmaster'", () => {
      fc.assert(
        fc.property(
          fc.constantFrom("none", undefined),
          fc.constantFrom("admin", "scheduler", "supervisor", "user"),
          arbOrgId,
          (platformRole, orgRole, orgId) => {
            const claims = {
              platform_role: platformRole,
              org_role: orgRole,
              org_id: orgId,
            };

            const headers = simulateHeaderInjection(claims);
            expect(headers.role).toBe(orgRole);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("header defaults to 'user' when org_role is undefined and platform_role is not 'gridmaster'", () => {
      fc.assert(
        fc.property(
          fc.constantFrom("none", undefined),
          arbOrgId,
          (platformRole, orgId) => {
            const claims = {
              platform_role: platformRole,
              org_role: undefined,
              org_id: orgId,
            };

            const headers = simulateHeaderInjection(claims);
            expect(headers.role).toBe("user");
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe("x-dubgrid-org-id header injection", () => {
    it("header contains the org_id from claims when present", () => {
      fc.assert(
        fc.property(arbPlatformRole, arbOrgRole, fc.uuid(), (platformRole, orgRole, orgId) => {
          const claims = {
            platform_role: platformRole,
            org_role: orgRole,
            org_id: orgId,
          };

          const headers = simulateHeaderInjection(claims);
          expect(headers.orgId).toBe(orgId);
        }),
        { numRuns: 100 }
      );
    });

    it("header is empty string when org_id is null", () => {
      fc.assert(
        fc.property(arbPlatformRole, arbOrgRole, (platformRole, orgRole) => {
          const claims = {
            platform_role: platformRole,
            org_role: orgRole,
            org_id: undefined,
          };

          const headers = simulateHeaderInjection(claims);
          expect(headers.orgId).toBe("");
        }),
        { numRuns: 100 }
      );
    });

    it("header is empty string when org_id is undefined", () => {
      fc.assert(
        fc.property(arbPlatformRole, arbOrgRole, (platformRole, orgRole) => {
          const claims = {
            platform_role: platformRole,
            org_role: orgRole,
            org_id: undefined,
          };

          const headers = simulateHeaderInjection(claims);
          expect(headers.orgId).toBe("");
        }),
        { numRuns: 100 }
      );
    });
  });

  describe("combined header injection correctness", () => {
    it("both headers are correctly set for any valid JWT claims", () => {
      fc.assert(
        fc.property(arbJWTClaims, (claims) => {
          const expectedEffectiveRole = calculateEffectiveRole(claims);
          const expectedOrgId = claims.org_id ?? "";

          const headers = simulateHeaderInjection(claims);

          expect(headers.role).toBe(expectedEffectiveRole);
          expect(headers.orgId).toBe(expectedOrgId);
        }),
        { numRuns: 100 }
      );
    });

    it("gridmaster users have correct headers regardless of org_id", () => {
      fc.assert(
        fc.property(arbOrgRole, arbOrgId, (orgRole, orgId) => {
          const claims = {
            platform_role: "gridmaster",
            org_role: orgRole,
            org_id: orgId,
          };

          const headers = simulateHeaderInjection(claims);

          // Role should always be gridmaster
          expect(headers.role).toBe("gridmaster");
          // Org ID should be the value or empty string
          expect(headers.orgId).toBe(orgId ?? "");
        }),
        { numRuns: 100 }
      );
    });

    it("tenant users have correct headers based on org_role and org_id", () => {
      fc.assert(
        fc.property(
          fc.constantFrom("none", undefined),
          fc.constantFrom("admin", "scheduler", "supervisor", "user"),
          fc.uuid(),
          (platformRole, orgRole, orgId) => {
            const claims = {
              platform_role: platformRole,
              org_role: orgRole,
              org_id: orgId,
            };

            const headers = simulateHeaderInjection(claims);

            // Role should match org_role
            expect(headers.role).toBe(orgRole);
            // Org ID should be the provided value
            expect(headers.orgId).toBe(orgId);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("header values are consistent with middleware calculateEffectiveRole function", () => {
      fc.assert(
        fc.property(arbJWTClaims, (claims) => {
          // Use the actual middleware function
          const middlewareEffectiveRole = calculateEffectiveRole(claims);

          // Use our simulation
          const headers = simulateHeaderInjection(claims);

          // They should match
          expect(headers.role).toBe(middlewareEffectiveRole);
        }),
        { numRuns: 100 }
      );
    });
  });
});


// ── Property 6: Shift Version Increment ───────────────────────────────────────

/**
 * Mock implementation for shift update operations with optimistic locking.
 * Simulates the updateShiftV2 function behavior.
 */
function createMockShiftUpdateSystem() {
  interface ShiftV2 {
    id: string;
    orgId: string;
    userId: string;
    empId: string | null;
    shiftDate: string;
    startTime: string;
    endTime: string;
    version: number;
    idempotencyKey: string | null;
    createdBy: string;
    createdAt: string;
    updatedAt: string;
  }

  interface ShiftV2Update {
    empId?: string | null;
    shiftDate?: string;
    startTime?: string;
    endTime?: string;
  }

  class OptimisticLockError extends Error {
    constructor(
      public readonly shiftId: string,
      public readonly expectedVersion: number,
      public readonly actualVersion?: number
    ) {
      super(
        `Optimistic lock failed for shift ${shiftId}: expected version ${expectedVersion}${actualVersion !== undefined ? `, but found version ${actualVersion}` : ""
        }`
      );
      this.name = "OptimisticLockError";
    }
  }

  // In-memory state to simulate database
  const shifts: Map<string, ShiftV2> = new Map();

  /**
   * Creates a shift in the mock database.
   */
  function createShift(shift: ShiftV2): ShiftV2 {
    shifts.set(shift.id, { ...shift });
    return shift;
  }

  /**
   * Simulates the updateShiftV2 function with optimistic locking.
   * 
   * @param shiftId - The ID of the shift to update
   * @param updates - The fields to update
   * @param expectedVersion - The expected version for optimistic locking
   * @returns The updated shift
   * @throws OptimisticLockError if the version doesn't match
   */
  function updateShiftV2(
    shiftId: string,
    updates: ShiftV2Update,
    expectedVersion: number
  ): ShiftV2 {
    const shift = shifts.get(shiftId);

    if (!shift) {
      throw new OptimisticLockError(shiftId, expectedVersion);
    }

    // Check version match
    if (shift.version !== expectedVersion) {
      throw new OptimisticLockError(shiftId, expectedVersion, shift.version);
    }

    // Apply updates and increment version
    const updatedShift: ShiftV2 = {
      ...shift,
      ...updates,
      version: shift.version + 1,
      updatedAt: new Date().toISOString(),
    };

    shifts.set(shiftId, updatedShift);
    return updatedShift;
  }

  /**
   * Gets a shift by ID.
   */
  function getShift(shiftId: string): ShiftV2 | undefined {
    return shifts.get(shiftId);
  }

  return {
    createShift,
    updateShiftV2,
    getShift,
    OptimisticLockError,
    reset: () => {
      shifts.clear();
    },
  };
}

// Arbitraries for shift testing
const arbShiftDate = fc.tuple(
  fc.integer({ min: 2024, max: 2025 }),
  fc.integer({ min: 1, max: 12 }),
  fc.integer({ min: 1, max: 28 }) // Use 28 to avoid invalid dates
).map(([y, m, d]) => `${y}-${m.toString().padStart(2, "0")}-${d.toString().padStart(2, "0")}`);
const arbTime = fc.tuple(
  fc.integer({ min: 0, max: 23 }),
  fc.integer({ min: 0, max: 59 })
).map(([h, m]) => `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`);
const arbEmpId = fc.option(fc.uuid(), { nil: null });
const arbVersion = fc.integer({ min: 0, max: 1000 });

describe("Property 6: Shift Version Increment", () => {
  /**
   * **Validates: Requirements 3.4**
   *
   * For any successful shift update operation, the version column value after
   * the update should equal the version value before the update plus one.
   */

  let mockSystem: ReturnType<typeof createMockShiftUpdateSystem>;

  beforeEach(() => {
    mockSystem = createMockShiftUpdateSystem();
  });

  it("version increments by exactly 1 on successful update", () => {
    fc.assert(
      fc.property(
        arbUuid,
        arbUuid,
        arbUuid,
        arbShiftDate,
        arbTime,
        arbTime,
        arbVersion,
        arbEmpId,
        (shiftId, orgId, userId, shiftDate, startTime, endTime, initialVersion, newEmpId) => {
          mockSystem.reset();

          // Create initial shift
          const initialShift = mockSystem.createShift({
            id: shiftId,
            orgId,
            userId,
            empId: null,
            shiftDate,
            startTime,
            endTime,
            version: initialVersion,
            idempotencyKey: null,
            createdBy: userId,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });

          // Capture version before update
          const versionBefore = initialShift.version;

          // Perform update
          const updatedShift = mockSystem.updateShiftV2(
            shiftId,
            { empId: newEmpId },
            initialVersion
          );

          // Verify version incremented by exactly 1
          expect(updatedShift.version).toBe(versionBefore + 1);
        }
      ),
      { numRuns: 100 }
    );
  });

  it("multiple sequential updates increment version correctly", () => {
    fc.assert(
      fc.property(
        arbUuid,
        arbUuid,
        arbUuid,
        arbShiftDate,
        arbTime,
        arbTime,
        fc.integer({ min: 2, max: 10 }),
        (shiftId, orgId, userId, shiftDate, startTime, endTime, updateCount) => {
          mockSystem.reset();

          // Create initial shift with version 0
          mockSystem.createShift({
            id: shiftId,
            orgId,
            userId,
            empId: null,
            shiftDate,
            startTime,
            endTime,
            version: 0,
            idempotencyKey: null,
            createdBy: userId,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });

          // Perform multiple updates
          let currentVersion = 0;
          for (let i = 0; i < updateCount; i++) {
            const updatedShift = mockSystem.updateShiftV2(
              shiftId,
              { empId: `emp-${i + 1}` },
              currentVersion
            );

            // Verify version incremented by exactly 1
            expect(updatedShift.version).toBe(currentVersion + 1);
            currentVersion = updatedShift.version;
          }

          // Final version should equal the number of updates
          expect(currentVersion).toBe(updateCount);
        }
      ),
      { numRuns: 100 }
    );
  });

  it("version increment is atomic with the update", () => {
    fc.assert(
      fc.property(
        arbUuid,
        arbUuid,
        arbUuid,
        arbShiftDate,
        arbTime,
        arbTime,
        arbVersion,
        arbShiftDate,
        arbTime,
        arbTime,
        (shiftId, orgId, userId, shiftDate, startTime, endTime, initialVersion, newDate, newStart, newEnd) => {
          mockSystem.reset();

          // Create initial shift
          mockSystem.createShift({
            id: shiftId,
            orgId,
            userId,
            empId: null,
            shiftDate,
            startTime,
            endTime,
            version: initialVersion,
            idempotencyKey: null,
            createdBy: userId,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });

          // Perform update with multiple fields
          const updatedShift = mockSystem.updateShiftV2(
            shiftId,
            { shiftDate: newDate, startTime: newStart, endTime: newEnd },
            initialVersion
          );

          // Verify all updates applied and version incremented
          expect(updatedShift.shiftDate).toBe(newDate);
          expect(updatedShift.startTime).toBe(newStart);
          expect(updatedShift.endTime).toBe(newEnd);
          expect(updatedShift.version).toBe(initialVersion + 1);
        }
      ),
      { numRuns: 100 }
    );
  });

  it("version mismatch throws OptimisticLockError", () => {
    fc.assert(
      fc.property(
        arbUuid,
        arbUuid,
        arbUuid,
        arbShiftDate,
        arbTime,
        arbTime,
        arbVersion,
        fc.integer({ min: 1, max: 100 }),
        (shiftId, orgId, userId, shiftDate, startTime, endTime, actualVersion, versionOffset) => {
          mockSystem.reset();

          // Create initial shift
          mockSystem.createShift({
            id: shiftId,
            orgId,
            userId,
            empId: null,
            shiftDate,
            startTime,
            endTime,
            version: actualVersion,
            idempotencyKey: null,
            createdBy: userId,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });

          // Attempt update with wrong version
          const wrongVersion = actualVersion + versionOffset;
          expect(() =>
            mockSystem.updateShiftV2(shiftId, { empId: "emp-1" }, wrongVersion)
          ).toThrow(mockSystem.OptimisticLockError);

          // Verify shift version unchanged
          const shift = mockSystem.getShift(shiftId);
          expect(shift?.version).toBe(actualVersion);
        }
      ),
      { numRuns: 100 }
    );
  });

  it("failed update does not increment version", () => {
    fc.assert(
      fc.property(
        arbUuid,
        arbUuid,
        arbUuid,
        arbShiftDate,
        arbTime,
        arbTime,
        arbVersion,
        (shiftId, orgId, userId, shiftDate, startTime, endTime, actualVersion) => {
          mockSystem.reset();

          // Create initial shift
          mockSystem.createShift({
            id: shiftId,
            orgId,
            userId,
            empId: null,
            shiftDate,
            startTime,
            endTime,
            version: actualVersion,
            idempotencyKey: null,
            createdBy: userId,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });

          // Capture version before failed update
          const versionBefore = mockSystem.getShift(shiftId)?.version;

          // Attempt update with wrong version
          try {
            mockSystem.updateShiftV2(shiftId, { empId: "emp-1" }, actualVersion + 1);
          } catch (e) {
            // Expected to throw
          }

          // Verify version unchanged
          const versionAfter = mockSystem.getShift(shiftId)?.version;
          expect(versionAfter).toBe(versionBefore);
        }
      ),
      { numRuns: 100 }
    );
  });

  it("returned shift has the new version value", () => {
    fc.assert(
      fc.property(
        arbUuid,
        arbUuid,
        arbUuid,
        arbShiftDate,
        arbTime,
        arbTime,
        arbVersion,
        (shiftId, orgId, userId, shiftDate, startTime, endTime, initialVersion) => {
          mockSystem.reset();

          // Create initial shift
          mockSystem.createShift({
            id: shiftId,
            orgId,
            userId,
            empId: null,
            shiftDate,
            startTime,
            endTime,
            version: initialVersion,
            idempotencyKey: null,
            createdBy: userId,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });

          // Perform update
          const returnedShift = mockSystem.updateShiftV2(
            shiftId,
            { empId: "emp-1" },
            initialVersion
          );

          // Verify returned shift has new version
          expect(returnedShift.version).toBe(initialVersion + 1);

          // Verify stored shift also has new version
          const storedShift = mockSystem.getShift(shiftId);
          expect(storedShift?.version).toBe(initialVersion + 1);
        }
      ),
      { numRuns: 100 }
    );
  });
});


// ── Property 7: Shift Idempotency Key Uniqueness ──────────────────────────────

/**
 * Mock implementation for shift insert operations with idempotency support.
 * Simulates the insertShiftV2 function behavior.
 */
function createMockShiftInsertSystem() {
  interface ShiftV2 {
    id: string;
    orgId: string;
    userId: string;
    empId: string | null;
    shiftDate: string;
    startTime: string;
    endTime: string;
    version: number;
    idempotencyKey: string | null;
    createdBy: string;
    createdAt: string;
    updatedAt: string;
  }

  interface ShiftV2Insert {
    orgId: string;
    userId: string;
    empId?: string | null;
    shiftDate: string;
    startTime: string;
    endTime: string;
    idempotencyKey?: string | null;
    createdBy: string;
  }

  // In-memory state to simulate database
  const shifts: Map<string, ShiftV2> = new Map();
  // Track (org_id, idempotency_key) pairs for uniqueness constraint
  const idempotencyIndex: Set<string> = new Set();

  /**
   * Creates a composite key for the idempotency index.
   */
  function makeIdempotencyKey(orgId: string, idempotencyKey: string): string {
    return `${orgId}:${idempotencyKey}`;
  }

  /**
   * Simulates the insertShiftV2 function with idempotency support.
   * Uses ON CONFLICT DO NOTHING behavior for duplicate idempotency keys.
   * 
   * @param shift - The shift data to insert
   * @returns The inserted shift, or null if a duplicate idempotency key was provided
   */
  function insertShiftV2(shift: ShiftV2Insert): ShiftV2 | null {
    const idempotencyKey = shift.idempotencyKey ?? null;

    // Check for duplicate idempotency key (only if key is provided)
    if (idempotencyKey !== null) {
      const compositeKey = makeIdempotencyKey(shift.orgId, idempotencyKey);
      if (idempotencyIndex.has(compositeKey)) {
        // Silently ignore duplicate - ON CONFLICT DO NOTHING
        return null;
      }
      // Add to index
      idempotencyIndex.add(compositeKey);
    }

    // Create the shift
    const now = new Date().toISOString();
    const newShift: ShiftV2 = {
      id: crypto.randomUUID(),
      orgId: shift.orgId,
      userId: shift.userId,
      empId: shift.empId ?? null,
      shiftDate: shift.shiftDate,
      startTime: shift.startTime,
      endTime: shift.endTime,
      version: 0,
      idempotencyKey,
      createdBy: shift.createdBy,
      createdAt: now,
      updatedAt: now,
    };

    shifts.set(newShift.id, newShift);
    return newShift;
  }

  /**
   * Gets all shifts in the database.
   */
  function getAllShifts(): ShiftV2[] {
    return Array.from(shifts.values());
  }

  /**
   * Gets shifts by org_id.
   */
  function getShiftsByOrg(orgId: string): ShiftV2[] {
    return Array.from(shifts.values()).filter(s => s.orgId === orgId);
  }

  /**
   * Gets a shift by idempotency key within an org.
   */
  function getShiftByIdempotencyKey(orgId: string, idempotencyKey: string): ShiftV2 | undefined {
    return Array.from(shifts.values()).find(
      s => s.orgId === orgId && s.idempotencyKey === idempotencyKey
    );
  }

  return {
    insertShiftV2,
    getAllShifts,
    getShiftsByOrg,
    getShiftByIdempotencyKey,
    reset: () => {
      shifts.clear();
      idempotencyIndex.clear();
    },
  };
}

describe("Property 7: Shift Idempotency Key Uniqueness", () => {
  /**
   * **Validates: Requirements 3.5, 7.2, 7.3**
   *
   * For any two shift insert operations with the same org_id and idempotency_key,
   * the second insert should be silently ignored (no error, no duplicate row created).
   */

  let mockSystem: ReturnType<typeof createMockShiftInsertSystem>;

  beforeEach(() => {
    mockSystem = createMockShiftInsertSystem();
  });

  it("second insert with same org_id and idempotency_key returns null", () => {
    fc.assert(
      fc.property(
        arbUuid,
        arbUuid,
        arbUuid,
        arbShiftDate,
        arbTime,
        arbTime,
        (orgId, userId, idempotencyKey, shiftDate, startTime, endTime) => {
          mockSystem.reset();

          // First insert should succeed
          const firstResult = mockSystem.insertShiftV2({
            orgId,
            userId,
            shiftDate,
            startTime,
            endTime,
            idempotencyKey,
            createdBy: userId,
          });
          expect(firstResult).not.toBeNull();

          // Second insert with same org_id and idempotency_key should return null
          const secondResult = mockSystem.insertShiftV2({
            orgId,
            userId,
            shiftDate,
            startTime,
            endTime,
            idempotencyKey,
            createdBy: userId,
          });
          expect(secondResult).toBeNull();
        }
      ),
      { numRuns: 100 }
    );
  });

  it("duplicate insert does not create additional row", () => {
    fc.assert(
      fc.property(
        arbUuid,
        arbUuid,
        arbUuid,
        arbShiftDate,
        arbTime,
        arbTime,
        fc.integer({ min: 2, max: 10 }),
        (orgId, userId, idempotencyKey, shiftDate, startTime, endTime, attemptCount) => {
          mockSystem.reset();

          // First insert
          mockSystem.insertShiftV2({
            orgId,
            userId,
            shiftDate,
            startTime,
            endTime,
            idempotencyKey,
            createdBy: userId,
          });

          // Multiple duplicate attempts
          for (let i = 1; i < attemptCount; i++) {
            mockSystem.insertShiftV2({
              orgId,
              userId,
              shiftDate,
              startTime,
              endTime,
              idempotencyKey,
              createdBy: userId,
            });
          }

          // Should only have one shift
          const shifts = mockSystem.getShiftsByOrg(orgId);
          expect(shifts).toHaveLength(1);
        }
      ),
      { numRuns: 100 }
    );
  });

  it("duplicate insert is silently ignored (no error thrown)", () => {
    fc.assert(
      fc.property(
        arbUuid,
        arbUuid,
        arbUuid,
        arbShiftDate,
        arbTime,
        arbTime,
        (orgId, userId, idempotencyKey, shiftDate, startTime, endTime) => {
          mockSystem.reset();

          // First insert
          mockSystem.insertShiftV2({
            orgId,
            userId,
            shiftDate,
            startTime,
            endTime,
            idempotencyKey,
            createdBy: userId,
          });

          // Second insert should not throw
          expect(() =>
            mockSystem.insertShiftV2({
              orgId,
              userId,
              shiftDate,
              startTime,
              endTime,
              idempotencyKey,
              createdBy: userId,
            })
          ).not.toThrow();
        }
      ),
      { numRuns: 100 }
    );
  });

  it("same idempotency_key in different orgs creates separate shifts", () => {
    fc.assert(
      fc.property(
        arbUuid,
        arbUuid,
        arbUuid,
        arbUuid,
        arbShiftDate,
        arbTime,
        arbTime,
        (org1Id, org2Id, userId, idempotencyKey, shiftDate, startTime, endTime) => {
          // Ensure orgs are different
          fc.pre(org1Id !== org2Id);

          mockSystem.reset();

          // Insert in org1
          const result1 = mockSystem.insertShiftV2({
            orgId: org1Id,
            userId,
            shiftDate,
            startTime,
            endTime,
            idempotencyKey,
            createdBy: userId,
          });
          expect(result1).not.toBeNull();

          // Insert in org2 with same idempotency_key should succeed
          const result2 = mockSystem.insertShiftV2({
            orgId: org2Id,
            userId,
            shiftDate,
            startTime,
            endTime,
            idempotencyKey,
            createdBy: userId,
          });
          expect(result2).not.toBeNull();

          // Both shifts should exist
          expect(mockSystem.getShiftsByOrg(org1Id)).toHaveLength(1);
          expect(mockSystem.getShiftsByOrg(org2Id)).toHaveLength(1);
        }
      ),
      { numRuns: 100 }
    );
  });

  it("different idempotency_keys in same org create separate shifts", () => {
    fc.assert(
      fc.property(
        arbUuid,
        arbUuid,
        fc.array(arbUuid, { minLength: 2, maxLength: 5 }),
        arbShiftDate,
        arbTime,
        arbTime,
        (orgId, userId, idempotencyKeys, shiftDate, startTime, endTime) => {
          // Ensure all keys are unique
          fc.pre(new Set(idempotencyKeys).size === idempotencyKeys.length);

          mockSystem.reset();

          // Insert shifts with different idempotency keys
          for (const key of idempotencyKeys) {
            const result = mockSystem.insertShiftV2({
              orgId,
              userId,
              shiftDate,
              startTime,
              endTime,
              idempotencyKey: key,
              createdBy: userId,
            });
            expect(result).not.toBeNull();
          }

          // All shifts should exist
          const shifts = mockSystem.getShiftsByOrg(orgId);
          expect(shifts).toHaveLength(idempotencyKeys.length);
        }
      ),
      { numRuns: 100 }
    );
  });

  it("null idempotency_key allows multiple inserts", () => {
    fc.assert(
      fc.property(
        arbUuid,
        arbUuid,
        arbShiftDate,
        arbTime,
        arbTime,
        fc.integer({ min: 2, max: 5 }),
        (orgId, userId, shiftDate, startTime, endTime, insertCount) => {
          mockSystem.reset();

          // Insert multiple shifts with null idempotency_key
          for (let i = 0; i < insertCount; i++) {
            const result = mockSystem.insertShiftV2({
              orgId,
              userId,
              shiftDate,
              startTime,
              endTime,
              idempotencyKey: null,
              createdBy: userId,
            });
            expect(result).not.toBeNull();
          }

          // All shifts should exist
          const shifts = mockSystem.getShiftsByOrg(orgId);
          expect(shifts).toHaveLength(insertCount);
        }
      ),
      { numRuns: 100 }
    );
  });

  it("original shift data is preserved after duplicate attempt", () => {
    fc.assert(
      fc.property(
        arbUuid,
        arbUuid,
        arbUuid,
        arbShiftDate,
        arbTime,
        arbTime,
        arbShiftDate,
        arbTime,
        arbTime,
        (orgId, userId, idempotencyKey, date1, start1, end1, date2, start2, end2) => {
          mockSystem.reset();

          // First insert with original data
          const firstResult = mockSystem.insertShiftV2({
            orgId,
            userId,
            shiftDate: date1,
            startTime: start1,
            endTime: end1,
            idempotencyKey,
            createdBy: userId,
          });
          expect(firstResult).not.toBeNull();

          // Second insert with different data but same idempotency_key
          mockSystem.insertShiftV2({
            orgId,
            userId,
            shiftDate: date2,
            startTime: start2,
            endTime: end2,
            idempotencyKey,
            createdBy: userId,
          });

          // Original shift data should be preserved
          const shift = mockSystem.getShiftByIdempotencyKey(orgId, idempotencyKey);
          expect(shift).toBeDefined();
          expect(shift?.shiftDate).toBe(date1);
          expect(shift?.startTime).toBe(start1);
          expect(shift?.endTime).toBe(end1);
        }
      ),
      { numRuns: 100 }
    );
  });

  it("idempotency constraint is per-org", () => {
    fc.assert(
      fc.property(
        fc.array(arbUuid, { minLength: 2, maxLength: 4 }),
        arbUuid,
        arbUuid,
        arbShiftDate,
        arbTime,
        arbTime,
        (orgIds, userId, idempotencyKey, shiftDate, startTime, endTime) => {
          // Ensure all org IDs are unique
          fc.pre(new Set(orgIds).size === orgIds.length);

          mockSystem.reset();

          // Insert with same idempotency_key in each org
          for (const orgId of orgIds) {
            const result = mockSystem.insertShiftV2({
              orgId,
              userId,
              shiftDate,
              startTime,
              endTime,
              idempotencyKey,
              createdBy: userId,
            });
            expect(result).not.toBeNull();
          }

          // Each org should have exactly one shift
          for (const orgId of orgIds) {
            const shifts = mockSystem.getShiftsByOrg(orgId);
            expect(shifts).toHaveLength(1);
          }

          // Total shifts should equal number of orgs
          expect(mockSystem.getAllShifts()).toHaveLength(orgIds.length);
        }
      ),
      { numRuns: 100 }
    );
  });
});


// ── Property 21: Shift RLS Enforcement ────────────────────────────────────────

/**
 * Mock implementation for shift RLS policy enforcement.
 * Simulates the RLS policies on the shifts_v2 table.
 */
function createMockShiftRLSSystem() {
  interface ShiftV2 {
    id: string;
    orgId: string;
    userId: string;
    empId: string | null;
    shiftDate: string;
    startTime: string;
    endTime: string;
    version: number;
    idempotencyKey: string | null;
    createdBy: string;
    createdAt: string;
    updatedAt: string;
  }

  interface ShiftV2Insert {
    orgId: string;
    userId: string;
    empId?: string | null;
    shiftDate: string;
    startTime: string;
    endTime: string;
    idempotencyKey?: string | null;
    createdBy: string;
  }

  interface ShiftV2Update {
    empId?: string | null;
    shiftDate?: string;
    startTime?: string;
    endTime?: string;
  }

  type OrganizationRole = "admin" | "scheduler" | "supervisor" | "user";
  type AllRoles = OrganizationRole | "gridmaster";

  // Role hierarchy levels
  const ROLE_LEVEL: Record<AllRoles, number> = {
    gridmaster: 4,
    admin: 3,
    scheduler: 2,
    supervisor: 1,
    user: 0,
  };

  // In-memory state to simulate database
  const shifts: Map<string, ShiftV2> = new Map();
  const idempotencyIndex: Set<string> = new Set();

  // Current authenticated user context
  let currentAuthUid: string | null = null;
  let currentUserOrgId: string | null = null;
  let currentUserRole: AllRoles = "user";

  /**
   * Sets the current authenticated user context (simulates auth.uid() and claims)
   */
  function setAuthContext(
    userId: string | null,
    orgId: string | null,
    role: AllRoles
  ) {
    currentAuthUid = userId;
    currentUserOrgId = orgId;
    currentUserRole = role;
  }

  /**
   * Checks if current user is gridmaster
   */
  function isGridmaster(): boolean {
    return currentUserRole === "gridmaster";
  }

  /**
   * Checks if current user has at least scheduler role
   */
  function isSchedulerOrAbove(): boolean {
    return ROLE_LEVEL[currentUserRole] >= ROLE_LEVEL["scheduler"];
  }

  /**
   * Creates a composite key for the idempotency index.
   */
  function makeIdempotencyKey(orgId: string, idempotencyKey: string): string {
    return `${orgId}:${idempotencyKey}`;
  }

  /**
   * Creates a shift bypassing RLS (admin operation for test setup)
   */
  function createShiftAdmin(shift: ShiftV2): ShiftV2 {
    shifts.set(shift.id, { ...shift });
    if (shift.idempotencyKey) {
      idempotencyIndex.add(makeIdempotencyKey(shift.orgId, shift.idempotencyKey));
    }
    return shift;
  }

  /**
   * Simulates SELECT on shifts_v2 with RLS enforcement.
   * RLS Policy: SELECT for org members (user_id in same org) OR gridmaster
   */
  function selectShifts(filters?: { orgId?: string; id?: string }): ShiftV2[] {
    if (!currentAuthUid) {
      // No authenticated user - return empty
      return [];
    }

    let result = Array.from(shifts.values());

    // Apply RLS policy
    if (!isGridmaster()) {
      // Non-gridmaster can only see shifts in their org
      result = result.filter((s) => s.orgId === currentUserOrgId);
    }

    // Apply additional filters
    if (filters) {
      if (filters.orgId) {
        result = result.filter((s) => s.orgId === filters.orgId);
      }
      if (filters.id) {
        result = result.filter((s) => s.id === filters.id);
      }
    }

    return result;
  }

  /**
   * Simulates INSERT on shifts_v2 with RLS enforcement.
   * RLS Policy: INSERT for scheduler+ roles in their org, OR gridmaster
   * @returns The inserted shift, or throws RLSPolicyViolationError
   */
  function insertShift(shift: ShiftV2Insert): ShiftV2 {
    if (!currentAuthUid) {
      throw new RLSPolicyViolationError(
        "INSERT operation rejected by RLS policy: not authenticated"
      );
    }

    // Check RLS policy: scheduler+ in their org, or gridmaster
    if (!isGridmaster()) {
      if (!isSchedulerOrAbove()) {
        throw new RLSPolicyViolationError(
          "INSERT operation rejected by RLS policy: requires scheduler role or above"
        );
      }
      if (shift.orgId !== currentUserOrgId) {
        throw new RLSPolicyViolationError(
          "INSERT operation rejected by RLS policy: cannot insert shifts in other orgs"
        );
      }
    }

    // Check idempotency constraint
    const idempotencyKey = shift.idempotencyKey ?? null;
    if (idempotencyKey !== null) {
      const compositeKey = makeIdempotencyKey(shift.orgId, idempotencyKey);
      if (idempotencyIndex.has(compositeKey)) {
        // Silently ignore duplicate - ON CONFLICT DO NOTHING
        return shifts.get(
          Array.from(shifts.values()).find(
            (s) => s.orgId === shift.orgId && s.idempotencyKey === idempotencyKey
          )!.id
        )!;
      }
      idempotencyIndex.add(compositeKey);
    }

    // Create the shift
    const now = new Date().toISOString();
    const newShift: ShiftV2 = {
      id: crypto.randomUUID(),
      orgId: shift.orgId,
      userId: shift.userId,
      empId: shift.empId ?? null,
      shiftDate: shift.shiftDate,
      startTime: shift.startTime,
      endTime: shift.endTime,
      version: 0,
      idempotencyKey,
      createdBy: shift.createdBy,
      createdAt: now,
      updatedAt: now,
    };

    shifts.set(newShift.id, newShift);
    return newShift;
  }

  /**
   * Simulates UPDATE on shifts_v2 with RLS enforcement.
   * RLS Policy: UPDATE for scheduler+ roles in their org, OR gridmaster
   * @returns The updated shift, or throws RLSPolicyViolationError
   */
  function updateShift(shiftId: string, updates: ShiftV2Update): ShiftV2 {
    if (!currentAuthUid) {
      throw new RLSPolicyViolationError(
        "UPDATE operation rejected by RLS policy: not authenticated"
      );
    }

    const shift = shifts.get(shiftId);
    if (!shift) {
      throw new Error("Shift not found");
    }

    // Check RLS policy: scheduler+ in their org, or gridmaster
    if (!isGridmaster()) {
      if (!isSchedulerOrAbove()) {
        throw new RLSPolicyViolationError(
          "UPDATE operation rejected by RLS policy: requires scheduler role or above"
        );
      }
      if (shift.orgId !== currentUserOrgId) {
        throw new RLSPolicyViolationError(
          "UPDATE operation rejected by RLS policy: cannot update shifts in other orgs"
        );
      }
    }

    // Apply updates
    const updatedShift: ShiftV2 = {
      ...shift,
      ...updates,
      version: shift.version + 1,
      updatedAt: new Date().toISOString(),
    };

    shifts.set(shiftId, updatedShift);
    return updatedShift;
  }

  /**
   * Simulates DELETE on shifts_v2 with RLS enforcement.
   * RLS Policy: DELETE for scheduler+ roles in their org, OR gridmaster
   * @returns true if deleted, or throws RLSPolicyViolationError
   */
  function deleteShift(shiftId: string): boolean {
    if (!currentAuthUid) {
      throw new RLSPolicyViolationError(
        "DELETE operation rejected by RLS policy: not authenticated"
      );
    }

    const shift = shifts.get(shiftId);
    if (!shift) {
      return false; // Nothing to delete
    }

    // Check RLS policy: scheduler+ in their org, or gridmaster
    if (!isGridmaster()) {
      if (!isSchedulerOrAbove()) {
        throw new RLSPolicyViolationError(
          "DELETE operation rejected by RLS policy: requires scheduler role or above"
        );
      }
      if (shift.orgId !== currentUserOrgId) {
        throw new RLSPolicyViolationError(
          "DELETE operation rejected by RLS policy: cannot delete shifts in other orgs"
        );
      }
    }

    // Remove from idempotency index if applicable
    if (shift.idempotencyKey) {
      idempotencyIndex.delete(makeIdempotencyKey(shift.orgId, shift.idempotencyKey));
    }

    shifts.delete(shiftId);
    return true;
  }

  /**
   * Gets all shifts in the database (admin view, bypasses RLS)
   */
  function getAllShiftsAdmin(): ShiftV2[] {
    return Array.from(shifts.values());
  }

  return {
    setAuthContext,
    createShiftAdmin,
    selectShifts,
    insertShift,
    updateShift,
    deleteShift,
    getAllShiftsAdmin,
    reset: () => {
      shifts.clear();
      idempotencyIndex.clear();
      currentAuthUid = null;
      currentUserOrgId = null;
      currentUserRole = "user";
    },
  };
}

// Arbitraries for shift RLS testing
const arbRoleBelowScheduler = fc.constantFrom<"supervisor" | "user">("supervisor", "user");
const arbRoleSchedulerOrAbove = fc.constantFrom<"scheduler" | "admin">("scheduler", "admin");
const arbAllRolesForRLS = fc.constantFrom<"admin" | "scheduler" | "supervisor" | "user" | "gridmaster">(
  "admin",
  "scheduler",
  "supervisor",
  "user",
  "gridmaster"
);

describe("Property 21: Shift RLS Enforcement", () => {
  /**
   * **Validates: Requirements 7.4**
   *
   * For any user with role below 'scheduler', INSERT, UPDATE, and DELETE operations
   * on shifts should be rejected by RLS policies, while SELECT should succeed for
   * shifts in their org.
   */

  let mockSystem: ReturnType<typeof createMockShiftRLSSystem>;

  beforeEach(() => {
    mockSystem = createMockShiftRLSSystem();
  });

  it("users with role below scheduler cannot INSERT shifts", () => {
    fc.assert(
      fc.property(
        arbUuid,
        arbUuid,
        arbRoleBelowScheduler,
        arbShiftDate,
        arbTime,
        arbTime,
        (userId, orgId, role, shiftDate, startTime, endTime) => {
          mockSystem.reset();

          // Set up user with role below scheduler
          mockSystem.setAuthContext(userId, orgId, role);

          // Attempt to insert shift should throw RLS violation
          expect(() =>
            mockSystem.insertShift({
              orgId,
              userId,
              shiftDate,
              startTime,
              endTime,
              createdBy: userId,
            })
          ).toThrow(RLSPolicyViolationError);
        }
      ),
      { numRuns: 100 }
    );
  });

  it("users with role below scheduler cannot UPDATE shifts", () => {
    fc.assert(
      fc.property(
        arbUuid,
        arbUuid,
        arbUuid,
        arbRoleBelowScheduler,
        arbShiftDate,
        arbTime,
        arbTime,
        (userId, orgId, shiftId, role, shiftDate, startTime, endTime) => {
          mockSystem.reset();

          // Create a shift (admin operation)
          mockSystem.createShiftAdmin({
            id: shiftId,
            orgId,
            userId,
            empId: null,
            shiftDate,
            startTime,
            endTime,
            version: 0,
            idempotencyKey: null,
            createdBy: userId,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });

          // Set up user with role below scheduler
          mockSystem.setAuthContext(userId, orgId, role);

          // Attempt to update shift should throw RLS violation
          expect(() =>
            mockSystem.updateShift(shiftId, { empId: "emp-1" })
          ).toThrow(RLSPolicyViolationError);
        }
      ),
      { numRuns: 100 }
    );
  });

  it("users with role below scheduler cannot DELETE shifts", () => {
    fc.assert(
      fc.property(
        arbUuid,
        arbUuid,
        arbUuid,
        arbRoleBelowScheduler,
        arbShiftDate,
        arbTime,
        arbTime,
        (userId, orgId, shiftId, role, shiftDate, startTime, endTime) => {
          mockSystem.reset();

          // Create a shift (admin operation)
          mockSystem.createShiftAdmin({
            id: shiftId,
            orgId,
            userId,
            empId: null,
            shiftDate,
            startTime,
            endTime,
            version: 0,
            idempotencyKey: null,
            createdBy: userId,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });

          // Set up user with role below scheduler
          mockSystem.setAuthContext(userId, orgId, role);

          // Attempt to delete shift should throw RLS violation
          expect(() =>
            mockSystem.deleteShift(shiftId)
          ).toThrow(RLSPolicyViolationError);
        }
      ),
      { numRuns: 100 }
    );
  });

  it("users with role below scheduler CAN SELECT shifts in their org", () => {
    fc.assert(
      fc.property(
        arbUuid,
        arbUuid,
        arbUuid,
        arbRoleBelowScheduler,
        arbShiftDate,
        arbTime,
        arbTime,
        (userId, orgId, shiftId, role, shiftDate, startTime, endTime) => {
          mockSystem.reset();

          // Create a shift (admin operation)
          mockSystem.createShiftAdmin({
            id: shiftId,
            orgId,
            userId,
            empId: null,
            shiftDate,
            startTime,
            endTime,
            version: 0,
            idempotencyKey: null,
            createdBy: userId,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });

          // Set up user with role below scheduler in the same org
          mockSystem.setAuthContext(userId, orgId, role);

          // SELECT should succeed
          const shifts = mockSystem.selectShifts();
          expect(shifts).toHaveLength(1);
          expect(shifts[0].id).toBe(shiftId);
        }
      ),
      { numRuns: 100 }
    );
  });

  it("scheduler and admin CAN perform all operations on shifts in their org", () => {
    fc.assert(
      fc.property(
        arbUuid,
        arbUuid,
        arbRoleSchedulerOrAbove,
        arbShiftDate,
        arbTime,
        arbTime,
        (userId, orgId, role, shiftDate, startTime, endTime) => {
          mockSystem.reset();

          // Set up user with scheduler or admin role
          mockSystem.setAuthContext(userId, orgId, role);

          // INSERT should succeed
          const insertedShift = mockSystem.insertShift({
            orgId,
            userId,
            shiftDate,
            startTime,
            endTime,
            createdBy: userId,
          });
          expect(insertedShift).toBeDefined();
          expect(insertedShift.orgId).toBe(orgId);

          // SELECT should succeed
          const selectedShifts = mockSystem.selectShifts();
          expect(selectedShifts).toHaveLength(1);

          // UPDATE should succeed
          const updatedShift = mockSystem.updateShift(insertedShift.id, { empId: "emp-1" });
          expect(updatedShift.empId).toBe("emp-1");

          // DELETE should succeed
          const deleted = mockSystem.deleteShift(insertedShift.id);
          expect(deleted).toBe(true);

          // Verify shift is gone
          expect(mockSystem.selectShifts()).toHaveLength(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  it("gridmaster CAN perform all operations on any shift", () => {
    fc.assert(
      fc.property(
        arbUuid,
        arbUuid,
        arbUuid,
        arbShiftDate,
        arbTime,
        arbTime,
        (gridmasterId, targetOrgId, targetUserId, shiftDate, startTime, endTime) => {
          mockSystem.reset();

          // Set up gridmaster (no org affiliation)
          mockSystem.setAuthContext(gridmasterId, null, "gridmaster");

          // INSERT should succeed in any org
          const insertedShift = mockSystem.insertShift({
            orgId: targetOrgId,
            userId: targetUserId,
            shiftDate,
            startTime,
            endTime,
            createdBy: gridmasterId,
          });
          expect(insertedShift).toBeDefined();
          expect(insertedShift.orgId).toBe(targetOrgId);

          // SELECT should succeed
          const selectedShifts = mockSystem.selectShifts();
          expect(selectedShifts).toHaveLength(1);

          // UPDATE should succeed
          const updatedShift = mockSystem.updateShift(insertedShift.id, { empId: "emp-1" });
          expect(updatedShift.empId).toBe("emp-1");

          // DELETE should succeed
          const deleted = mockSystem.deleteShift(insertedShift.id);
          expect(deleted).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  it("users cannot access shifts from other orgs (except gridmaster)", () => {
    fc.assert(
      fc.property(
        arbUuid,
        arbUuid,
        arbUuid,
        arbUuid,
        arbAllRolesForRLS,
        arbShiftDate,
        arbTime,
        arbTime,
        (userId, userOrgId, otherOrgId, shiftId, role, shiftDate, startTime, endTime) => {
          // Ensure orgs are different
          fc.pre(userOrgId !== otherOrgId);

          mockSystem.reset();

          // Create a shift in a different org (admin operation)
          mockSystem.createShiftAdmin({
            id: shiftId,
            orgId: otherOrgId,
            userId: "other-user",
            empId: null,
            shiftDate,
            startTime,
            endTime,
            version: 0,
            idempotencyKey: null,
            createdBy: "other-user",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });

          // Set up user in their own org
          mockSystem.setAuthContext(userId, userOrgId, role);

          if (role === "gridmaster") {
            // Gridmaster CAN see shifts from other orgs
            const shifts = mockSystem.selectShifts();
            expect(shifts).toHaveLength(1);
          } else {
            // Non-gridmaster cannot see shifts from other orgs
            const shifts = mockSystem.selectShifts();
            expect(shifts).toHaveLength(0);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it("scheduler/admin cannot INSERT shifts in other orgs", () => {
    fc.assert(
      fc.property(
        arbUuid,
        arbUuid,
        arbUuid,
        arbRoleSchedulerOrAbove,
        arbShiftDate,
        arbTime,
        arbTime,
        (userId, userOrgId, otherOrgId, role, shiftDate, startTime, endTime) => {
          // Ensure orgs are different
          fc.pre(userOrgId !== otherOrgId);

          mockSystem.reset();

          // Set up user with scheduler/admin role in their org
          mockSystem.setAuthContext(userId, userOrgId, role);

          // Attempt to insert shift in other org should throw RLS violation
          expect(() =>
            mockSystem.insertShift({
              orgId: otherOrgId,
              userId,
              shiftDate,
              startTime,
              endTime,
              createdBy: userId,
            })
          ).toThrow(RLSPolicyViolationError);
        }
      ),
      { numRuns: 100 }
    );
  });

  it("scheduler/admin cannot UPDATE shifts in other orgs", () => {
    fc.assert(
      fc.property(
        arbUuid,
        arbUuid,
        arbUuid,
        arbUuid,
        arbRoleSchedulerOrAbove,
        arbShiftDate,
        arbTime,
        arbTime,
        (userId, userOrgId, otherOrgId, shiftId, role, shiftDate, startTime, endTime) => {
          // Ensure orgs are different
          fc.pre(userOrgId !== otherOrgId);

          mockSystem.reset();

          // Create a shift in other org (admin operation)
          mockSystem.createShiftAdmin({
            id: shiftId,
            orgId: otherOrgId,
            userId: "other-user",
            empId: null,
            shiftDate,
            startTime,
            endTime,
            version: 0,
            idempotencyKey: null,
            createdBy: "other-user",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });

          // Set up user with scheduler/admin role in their org
          mockSystem.setAuthContext(userId, userOrgId, role);

          // Attempt to update shift in other org should throw RLS violation
          expect(() =>
            mockSystem.updateShift(shiftId, { empId: "emp-1" })
          ).toThrow(RLSPolicyViolationError);
        }
      ),
      { numRuns: 100 }
    );
  });

  it("scheduler/admin cannot DELETE shifts in other orgs", () => {
    fc.assert(
      fc.property(
        arbUuid,
        arbUuid,
        arbUuid,
        arbUuid,
        arbRoleSchedulerOrAbove,
        arbShiftDate,
        arbTime,
        arbTime,
        (userId, userOrgId, otherOrgId, shiftId, role, shiftDate, startTime, endTime) => {
          // Ensure orgs are different
          fc.pre(userOrgId !== otherOrgId);

          mockSystem.reset();

          // Create a shift in other org (admin operation)
          mockSystem.createShiftAdmin({
            id: shiftId,
            orgId: otherOrgId,
            userId: "other-user",
            empId: null,
            shiftDate,
            startTime,
            endTime,
            version: 0,
            idempotencyKey: null,
            createdBy: "other-user",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });

          // Set up user with scheduler/admin role in their org
          mockSystem.setAuthContext(userId, userOrgId, role);

          // Attempt to delete shift in other org should throw RLS violation
          expect(() =>
            mockSystem.deleteShift(shiftId)
          ).toThrow(RLSPolicyViolationError);
        }
      ),
      { numRuns: 100 }
    );
  });

  it("shift data remains unchanged after failed write operations by low-role users", () => {
    fc.assert(
      fc.property(
        arbUuid,
        arbUuid,
        arbUuid,
        arbRoleBelowScheduler,
        arbShiftDate,
        arbTime,
        arbTime,
        (userId, orgId, shiftId, role, shiftDate, startTime, endTime) => {
          mockSystem.reset();

          // Create a shift (admin operation)
          const originalShift = mockSystem.createShiftAdmin({
            id: shiftId,
            orgId,
            userId,
            empId: null,
            shiftDate,
            startTime,
            endTime,
            version: 0,
            idempotencyKey: null,
            createdBy: userId,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });

          // Set up user with role below scheduler
          mockSystem.setAuthContext(userId, orgId, role);

          // Attempt update (should fail)
          try {
            mockSystem.updateShift(shiftId, { empId: "emp-999" });
          } catch (e) {
            // Expected
          }

          // Attempt delete (should fail)
          try {
            mockSystem.deleteShift(shiftId);
          } catch (e) {
            // Expected
          }

          // Verify shift is unchanged
          const allShifts = mockSystem.getAllShiftsAdmin();
          expect(allShifts).toHaveLength(1);
          expect(allShifts[0].id).toBe(originalShift.id);
          expect(allShifts[0].empId).toBe(originalShift.empId);
          expect(allShifts[0].version).toBe(originalShift.version);
        }
      ),
      { numRuns: 100 }
    );
  });

  it("error message indicates RLS policy rejection for INSERT by low-role users", () => {
    fc.assert(
      fc.property(
        arbUuid,
        arbUuid,
        arbRoleBelowScheduler,
        arbShiftDate,
        arbTime,
        arbTime,
        (userId, orgId, role, shiftDate, startTime, endTime) => {
          mockSystem.reset();

          // Set up user with role below scheduler
          mockSystem.setAuthContext(userId, orgId, role);

          // Verify error message mentions RLS policy
          expect(() =>
            mockSystem.insertShift({
              orgId,
              userId,
              shiftDate,
              startTime,
              endTime,
              createdBy: userId,
            })
          ).toThrow(/RLS policy/);
        }
      ),
      { numRuns: 100 }
    );
  });

  it("error message indicates RLS policy rejection for UPDATE by low-role users", () => {
    fc.assert(
      fc.property(
        arbUuid,
        arbUuid,
        arbUuid,
        arbRoleBelowScheduler,
        arbShiftDate,
        arbTime,
        arbTime,
        (userId, orgId, shiftId, role, shiftDate, startTime, endTime) => {
          mockSystem.reset();

          // Create a shift (admin operation)
          mockSystem.createShiftAdmin({
            id: shiftId,
            orgId,
            userId,
            empId: null,
            shiftDate,
            startTime,
            endTime,
            version: 0,
            idempotencyKey: null,
            createdBy: userId,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });

          // Set up user with role below scheduler
          mockSystem.setAuthContext(userId, orgId, role);

          // Verify error message mentions RLS policy
          expect(() =>
            mockSystem.updateShift(shiftId, { empId: "emp-1" })
          ).toThrow(/RLS policy/);
        }
      ),
      { numRuns: 100 }
    );
  });

  it("error message indicates RLS policy rejection for DELETE by low-role users", () => {
    fc.assert(
      fc.property(
        arbUuid,
        arbUuid,
        arbUuid,
        arbRoleBelowScheduler,
        arbShiftDate,
        arbTime,
        arbTime,
        (userId, orgId, shiftId, role, shiftDate, startTime, endTime) => {
          mockSystem.reset();

          // Create a shift (admin operation)
          mockSystem.createShiftAdmin({
            id: shiftId,
            orgId,
            userId,
            empId: null,
            shiftDate,
            startTime,
            endTime,
            version: 0,
            idempotencyKey: null,
            createdBy: userId,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });

          // Set up user with role below scheduler
          mockSystem.setAuthContext(userId, orgId, role);

          // Verify error message mentions RLS policy
          expect(() =>
            mockSystem.deleteShift(shiftId)
          ).toThrow(/RLS policy/);
        }
      ),
      { numRuns: 100 }
    );
  });
});
