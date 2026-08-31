import { describe, expect, it, vi } from "vitest";
import { loadMobileBootstrapPayload } from "./read";

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";

describe("loadMobileBootstrapPayload", () => {
  it("preserves role certification requirements in the authenticated bootstrap payload", async () => {
    const fetchMobileRoles = vi.fn(async () => [
      {
        id: 3,
        name: "Clinical Lead",
        abbr: "CL",
        requiredCertificationIds: [8, 9],
      },
    ]);

    const payload = await loadMobileBootstrapPayload(
      {
        currentOrg: { id: ORG_ID },
        serviceClient: {},
        userClient: {},
        user: { id: USER_ID, email: "alex@example.com" },
        memberships: [],
        permissions: { role: "admin", canManageUsers: true },
      } as never,
      {
        fetchLinkedEmployeeForUser: vi.fn(async () => null),
        fetchMobileUnreadNotificationCount: vi.fn(async () => 0),
        fetchMobileAbsenceTypes: vi.fn(async () => []),
        fetchMobileFocusAreas: vi.fn(async () => []),
        fetchMobileRoles,
        fetchMobileCertifications: vi.fn(async () => []),
        fetchMobileDepartments: vi.fn(async () => []),
        fetchTermsAcceptedVersion: vi.fn(async () => null),
        mapOrganizationToMobileConfig: vi.fn(() => ({ id: ORG_ID })),
      } as never,
    );

    expect(fetchMobileRoles).toHaveBeenCalledWith({}, ORG_ID);
    expect(payload.roles).toEqual([
      {
        id: 3,
        name: "Clinical Lead",
        abbr: "CL",
        requiredCertificationIds: [8, 9],
      },
    ]);
  });
});
