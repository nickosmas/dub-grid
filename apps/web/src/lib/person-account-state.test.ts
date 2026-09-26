import { describe, expect, it } from "vitest";
import type { Invitation } from "@/types";
import { getPersonAccountState } from "./person-account-state";

const NOW = Date.parse("2026-09-26T12:00:00.000Z");
const HOUR = 3_600_000;

function invitation(overrides: Partial<Invitation>): Invitation {
  return {
    id: "inv-1",
    orgId: "org-1",
    invitedBy: null,
    email: "mina@example.com",
    roleToAssign: "user",
    expiresAt: new Date(NOW + 24 * HOUR).toISOString(),
    acceptedAt: null,
    revokedAt: null,
    createdAt: new Date(NOW - 48 * HOUR).toISOString(),
    updatedAt: null,
    employeeId: "emp-1",
    ...overrides,
  };
}

const unlinked = { userId: null, email: "mina@example.com" };

describe("getPersonAccountState", () => {
  it("reads a linked account as linked whatever its invitations say", () => {
    expect(getPersonAccountState({ userId: "user-1", email: "" }, [invitation({})], NOW)).toEqual({
      kind: "linked",
    });
  });

  it("reports an open invitation with its address and dates", () => {
    const pending = invitation({});

    expect(getPersonAccountState(unlinked, [pending], NOW)).toEqual({
      kind: "pending",
      invitationId: "inv-1",
      email: "mina@example.com",
      sentAt: pending.createdAt,
      expiresAt: pending.expiresAt,
    });
  });

  it("turns expired once the invitation crosses its expiry", () => {
    const expiresAt = new Date(NOW + HOUR).toISOString();
    const invite = invitation({ expiresAt });

    expect(getPersonAccountState(unlinked, [invite], NOW).kind).toBe("pending");
    expect(getPersonAccountState(unlinked, [invite], NOW + HOUR).kind).toBe("expired");
  });

  it("ignores accepted and revoked invitations", () => {
    const history = [
      invitation({ id: "inv-accepted", acceptedAt: new Date(NOW - HOUR).toISOString() }),
      invitation({ id: "inv-revoked", revokedAt: new Date(NOW - HOUR).toISOString() }),
    ];

    expect(getPersonAccountState(unlinked, history, NOW)).toEqual({ kind: "not-invited" });
  });

  it("lets a newer revoked invitation leave an older expired one in charge", () => {
    const expired = invitation({
      id: "inv-expired",
      createdAt: new Date(NOW - 96 * HOUR).toISOString(),
      expiresAt: new Date(NOW - 24 * HOUR).toISOString(),
    });
    const revoked = invitation({
      id: "inv-revoked",
      createdAt: new Date(NOW - HOUR).toISOString(),
      revokedAt: new Date(NOW - HOUR).toISOString(),
    });

    expect(getPersonAccountState(unlinked, [revoked, expired], NOW)).toMatchObject({
      kind: "expired",
      invitationId: "inv-expired",
    });
  });

  it("takes the newest of several open invitations", () => {
    const older = invitation({
      id: "inv-old",
      createdAt: new Date(NOW - 96 * HOUR).toISOString(),
      expiresAt: new Date(NOW - 24 * HOUR).toISOString(),
    });
    const newer = invitation({ id: "inv-new" });

    expect(getPersonAccountState(unlinked, [older, newer], NOW)).toMatchObject({
      kind: "pending",
      invitationId: "inv-new",
    });
  });

  it("separates a person with no invitation from one with no address", () => {
    expect(getPersonAccountState(unlinked, [], NOW)).toEqual({ kind: "not-invited" });
    expect(getPersonAccountState({ userId: null, email: "" }, [], NOW)).toEqual({
      kind: "no-email",
    });
  });
});
