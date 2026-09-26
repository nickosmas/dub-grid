import { beforeEach, describe, expect, it, vi } from "vitest";

const verifyAccessToken = vi.fn();
const revokeSession = vi.fn();
const writeSecurityAuditEvent = vi.fn();
const orgMaybeSingle = vi.fn();
const membershipMaybeSingle = vi.fn();
const auditLimit = vi.fn();

vi.mock("server-only", () => ({}));
vi.mock("@/lib/api-auth", () => ({ createTokenScopedClient: vi.fn() }));
vi.mock("@/lib/auth/verify-token", () => ({
  verifyAccessToken: (token: string) => verifyAccessToken(token),
}));
vi.mock("@/lib/auth/revocation", () => ({
  revokeSession: (id: string) => revokeSession(id),
  revokeAllUserSessions: vi.fn(),
  revokeOtherUserSessions: vi.fn(),
}));
vi.mock("@/lib/auth/security-audit", () => ({
  writeSecurityAuditEvent: (input: unknown) => writeSecurityAuditEvent(input),
}));
vi.mock("@/lib/sentry", () => ({ captureException: vi.fn() }));
vi.mock("@/lib/logger", () => ({ default: { error: vi.fn() } }));

// Each query in the chain returns itself until the call that resolves it.
function chain(resolve: () => unknown) {
  const query: Record<string, unknown> = {};
  for (const method of ["select", "eq", "is"]) query[method] = () => query;
  query.maybeSingle = resolve;
  query.limit = resolve;
  return query;
}

vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({
    from: (table: string) => {
      if (table === "organizations") return chain(() => orgMaybeSingle());
      if (table === "organization_memberships") return chain(() => membershipMaybeSingle());
      if (table === "audit_log") return chain(() => auditLimit());
      throw new Error(`Unexpected table: ${table}`);
    },
  }),
}));

import {
  parseSignOutBody,
  recordHostOrganizationRefusal,
  revokeLocalSession,
} from "./session-sign-out";
import { hashSessionId } from "./sign-in-completion";

describe("parseSignOutBody's host refusal (F-28)", () => {
  it("reads a local refusal with a valid organization slug", () => {
    expect(
      parseSignOutBody({
        scope: "local",
        reason: "organization_access_denied",
        orgSlug: "calmhaven",
      }).hostRefusal,
    ).toEqual({ orgSlug: "calmhaven" });
  });

  it("ignores a refusal on a bulk sign-out or with a malformed slug", () => {
    expect(
      parseSignOutBody({ scope: "global", reason: "organization_access_denied", orgSlug: "a" })
        .hostRefusal,
    ).toBeNull();
    expect(
      parseSignOutBody({ scope: "local", reason: "organization_access_denied", orgSlug: "A B" })
        .hostRefusal,
    ).toBeNull();
    expect(parseSignOutBody({ scope: "local" }).hostRefusal).toBeNull();
  });
});

describe("recordHostOrganizationRefusal (F-28)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    orgMaybeSingle.mockResolvedValue({ data: { id: "org-1" }, error: null });
    membershipMaybeSingle.mockResolvedValue({ data: null, error: null });
    auditLimit.mockResolvedValue({ data: [], error: null });
  });

  it("records a verified refusal as a rejected sign-in outside the organization's log", async () => {
    await expect(recordHostOrganizationRefusal("user-1", "session-1", "calmhaven")).resolves.toBe(
      true,
    );
    expect(writeSecurityAuditEvent).toHaveBeenCalledWith({
      event: "security.auth.login",
      outcome: "rejected",
      reason: "organization_access_denied",
      orgId: null,
      actorId: "user-1",
      metadata: { surface: "web", method: "totp", sessionHash: hashSessionId("session-1") },
    });
  });

  it("records nothing for a member", async () => {
    membershipMaybeSingle.mockResolvedValue({ data: { user_id: "user-1" }, error: null });
    await expect(recordHostOrganizationRefusal("user-1", "session-1", "calmhaven")).resolves.toBe(
      false,
    );
    expect(writeSecurityAuditEvent).not.toHaveBeenCalled();
  });

  it("records nothing for an organization that does not exist", async () => {
    orgMaybeSingle.mockResolvedValue({ data: null, error: null });
    await recordHostOrganizationRefusal("user-1", "session-1", "nowhere");
    expect(writeSecurityAuditEvent).not.toHaveBeenCalled();
  });

  it("records a session's refusal once", async () => {
    auditLimit.mockResolvedValue({ data: [{ id: 1 }], error: null });
    await recordHostOrganizationRefusal("user-1", "session-1", "calmhaven");
    expect(writeSecurityAuditEvent).not.toHaveBeenCalled();
  });

  it("records nothing when a check fails", async () => {
    membershipMaybeSingle.mockResolvedValue({ data: null, error: new Error("down") });
    await recordHostOrganizationRefusal("user-1", "session-1", "calmhaven");
    expect(writeSecurityAuditEvent).not.toHaveBeenCalled();
  });
});

describe("revokeLocalSession with a host refusal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    orgMaybeSingle.mockResolvedValue({ data: { id: "org-1" }, error: null });
    membershipMaybeSingle.mockResolvedValue({ data: null, error: null });
    auditLimit.mockResolvedValue({ data: [], error: null });
    revokeSession.mockResolvedValue(undefined);
  });

  it("records the refusal, then revokes the session", async () => {
    verifyAccessToken.mockResolvedValue({ userId: "user-1", sessionId: "session-1" });
    await revokeLocalSession("token", { orgSlug: "calmhaven" });
    expect(writeSecurityAuditEvent).toHaveBeenCalledOnce();
    expect(revokeSession).toHaveBeenCalledWith("session-1");
  });

  it("records nothing for an unverifiable token", async () => {
    verifyAccessToken.mockResolvedValue(null);
    await revokeLocalSession("forged", { orgSlug: "calmhaven" });
    expect(writeSecurityAuditEvent).not.toHaveBeenCalled();
    expect(revokeSession).not.toHaveBeenCalled();
  });

  it("still revokes when the refusal cannot be checked", async () => {
    verifyAccessToken.mockResolvedValue({ userId: "user-1", sessionId: "session-1" });
    orgMaybeSingle.mockRejectedValue(new Error("down"));
    await revokeLocalSession("token", { orgSlug: "calmhaven" });
    expect(writeSecurityAuditEvent).not.toHaveBeenCalled();
    expect(revokeSession).toHaveBeenCalledWith("session-1");
  });
});
