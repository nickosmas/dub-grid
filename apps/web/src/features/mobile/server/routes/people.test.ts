import { beforeEach, describe, expect, it, vi } from "vitest";

const requireMobileAuth = vi.fn();
const fetchMobilePeople = vi.fn();

vi.mock("@/features/mobile/server", () => ({
  requireMobileAuth,
  fetchMobilePeople,
}));

describe("mobile people route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects users without staff visibility", async () => {
    requireMobileAuth.mockResolvedValue({
      permissions: {
        canViewStaff: false,
      },
    });

    const { GET } = await import("./people");
    const response = await GET({
      nextUrl: new URL("http://localhost/api/mobile/v1/people"),
    } as never);

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
  });

  it("returns the mobile people directory for authorized users", async () => {
    requireMobileAuth.mockResolvedValue({
      currentOrg: {
        id: "org-1",
      },
      permissions: {
        canViewStaff: true,
      },
      serviceClient: {},
    });
    fetchMobilePeople.mockResolvedValue([
      {
        id: "00000000-0000-0000-0000-000000000001",
        firstName: "Mina",
        lastName: "Diaz",
        phone: "555-0100",
        email: "mina@dubgrid.com",
        status: "active",
        focusAreaIds: [1, 2],
        contactNotes: "Weekend availability",
        statusChangedAt: "2026-04-20T12:00:00.000Z",
        statusNote: "",
        version: 7,
      },
    ]);

    const { GET } = await import("./people");
    const response = await GET({
      nextUrl: new URL("http://localhost/api/mobile/v1/people"),
    } as never);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(fetchMobilePeople).toHaveBeenCalledWith({}, "org-1");
    expect(payload.people).toEqual([
      {
        id: "00000000-0000-0000-0000-000000000001",
        firstName: "Mina",
        lastName: "Diaz",
        phone: "555-0100",
        email: "mina@dubgrid.com",
        status: "active",
        focusAreaIds: [1, 2],
        contactNotes: "Weekend availability",
        statusChangedAt: "2026-04-20T12:00:00.000Z",
        statusNote: "",
        version: 7,
      },
    ]);
  });
});
