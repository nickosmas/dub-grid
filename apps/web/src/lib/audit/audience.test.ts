import { describe, expect, it } from "vitest";
import { resolveAuditActionScope } from "./audience";
import { AUDIT_ACTIONS, ORG_AUDIENCE_ACTIONS, isVisibleToAudience } from "./registry";

describe("resolveAuditActionScope", () => {
  it("passes a platform reader's prefixes through untouched", () => {
    expect(resolveAuditActionScope("platform", ["billing.", "role."])).toEqual({
      kind: "open",
      prefixes: ["billing.", "role."],
    });
    expect(resolveAuditActionScope("platform", undefined)).toEqual({
      kind: "open",
      prefixes: undefined,
    });
  });

  it("gives an organization reader the full allowlist when nothing was requested", () => {
    const scope = resolveAuditActionScope("org", undefined);
    expect(scope).toEqual({ kind: "allowlist", actions: [...ORG_AUDIENCE_ACTIONS] });
    expect(scope.kind === "allowlist" && scope.actions.length).toBeGreaterThan(40);
  });

  it("narrows the allowlist by the requested prefixes", () => {
    const scope = resolveAuditActionScope("org", ["billing."]);
    expect(scope.kind).toBe("allowlist");
    if (scope.kind !== "allowlist") return;
    expect(scope.actions).toContain("billing.payment_failed");
    expect(scope.actions).not.toContain("billing.portal_opened");
    expect(scope.actions.every((action) => action.startsWith("billing."))).toBe(true);
  });

  it("returns an empty allowlist for a platform-only category", () => {
    expect(resolveAuditActionScope("org", ["impersonation."])).toEqual({
      kind: "allowlist",
      actions: [],
    });
    expect(resolveAuditActionScope("org", ["security."])).toEqual({
      kind: "allowlist",
      actions: [],
    });
  });

  it("shows every invitation authorization event to an organization and to platform staff", () => {
    // A refusal is only useful if the people who govern access can read it, and
    // an org reader sees an explicit allowlist rather than everything.
    for (const action of ["invitation.created", "invitation.access_denied"]) {
      expect(ORG_AUDIENCE_ACTIONS, `${action} unreadable by an organization`).toContain(action);
      expect(isVisibleToAudience(action, "org")).toBe(true);
      expect(isVisibleToAudience(action, "platform")).toBe(true);
    }
  });

  it("never lets an allowlisted name act as a prefix of a platform-only action", () => {
    // The SQL applies each name as `LIKE name || '%'`, so a name that prefixes
    // a platform-only action would let it through.
    const platformOnly = Object.entries(AUDIT_ACTIONS)
      .filter(([, spec]) => spec.audience === "platform")
      .map(([action]) => action);
    for (const allowed of ORG_AUDIENCE_ACTIONS) {
      for (const hidden of platformOnly) {
        expect(hidden.startsWith(allowed), `${allowed} prefixes ${hidden}`).toBe(false);
      }
    }
  });
});
