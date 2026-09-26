import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Organization } from "@/types";

const createOrganizationInvitation = vi.fn();

vi.mock("@/features/organization/client", () => ({
  createOrganizationInvitation: (...args: unknown[]) => createOrganizationInvitation(...args),
  saveOrganizationSettingsWithRecovery: vi.fn(),
}));
vi.mock("@/features/employees/client", () => ({ insertEmployee: vi.fn() }));
vi.mock("@/features/gridmaster/client", () => ({
  createGridmasterOrganizationSetup: vi.fn(),
}));
vi.mock("@/features/settings/client", () => ({}));

import { sendOrganizationInvitations } from "./persistence";

const ORG = { id: "org-1", name: "Acme Health" } as Organization;

describe("sendOrganizationInvitations", () => {
  beforeEach(() => {
    createOrganizationInvitation.mockReset();
  });

  it("counts an invitation as sent only when its email went out", async () => {
    // A separate send used to follow each create, and its failure was
    // swallowed while the invitation still counted as sent.
    const fetchSpy = vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchSpy);
    createOrganizationInvitation
      .mockResolvedValueOnce({ invitationId: "a", expiresAt: "2099-01-01T00:00:00Z" })
      .mockRejectedValueOnce(new Error("We couldn't send the invitation email."));

    const result = await sendOrganizationInvitations(ORG, [
      { employeeId: "e1", name: "One", email: "one@example.com", selected: true, role: "user" },
      { employeeId: "e2", name: "Two", email: "two@example.com", selected: true, role: "user" },
    ]);

    expect(result).toEqual({ sentCount: 1, failCount: 1 });
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("sends each invitation, Super Admin included, with the assured token (41d4)", async () => {
    createOrganizationInvitation.mockResolvedValue({ invitationId: "a", expiresAt: "x" });

    await sendOrganizationInvitations(
      ORG,
      [
        {
          employeeId: "e1",
          name: "One",
          email: "one@example.com",
          selected: true,
          role: "super_admin",
        },
      ],
      "fresh-token",
    );

    expect(createOrganizationInvitation).toHaveBeenCalledWith(
      { email: "one@example.com", role: "super_admin", orgId: "org-1", employeeId: "e1" },
      "fresh-token",
    );
  });
});
