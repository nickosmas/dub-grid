import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireGridmasterSession = vi.fn();
const getServiceClient = vi.fn();
const loadGridmasterOverview = vi.fn();
const loadGridmasterOrgHealth = vi.fn();
const loadGridmasterSecurity = vi.fn();
const loadGridmasterBilling = vi.fn();
const loadGridmasterCompliance = vi.fn();

vi.mock("@/lib/api-auth", () => ({
  requireGridmasterSession: (req: NextRequest) => requireGridmasterSession(req),
}));

vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => getServiceClient(),
}));

vi.mock("@/app/api/gridmaster/_lib/oversight", () => ({
  loadGridmasterOverview: (...args: unknown[]) => loadGridmasterOverview(...args),
  loadGridmasterOrgHealth: (...args: unknown[]) => loadGridmasterOrgHealth(...args),
  loadGridmasterSecurity: (...args: unknown[]) => loadGridmasterSecurity(...args),
  loadGridmasterBilling: (...args: unknown[]) => loadGridmasterBilling(...args),
  loadGridmasterCompliance: (...args: unknown[]) => loadGridmasterCompliance(...args),
}));

import { GET as getOverview } from "./overview/route";
import { GET as getOrgHealth } from "./org-health/route";
import { GET as getSecurity } from "./security/route";
import { GET as getBilling } from "./billing/route";
import { GET as getCompliance } from "./compliance/route";

const serviceClient = { from: vi.fn() };

describe("gridmaster oversight read APIs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getServiceClient.mockReturnValue(serviceClient);
    requireGridmasterSession.mockResolvedValue({
      user: { id: "gridmaster-user", email: "gm@example.com" },
      session: { access_token: "token" },
    });
    loadGridmasterOverview.mockResolvedValue({ generatedAt: "2026-05-02T00:00:00.000Z" });
    loadGridmasterOrgHealth.mockResolvedValue({ organizations: [] });
    loadGridmasterSecurity.mockResolvedValue({ generatedAt: "2026-05-02T00:00:00.000Z" });
    loadGridmasterBilling.mockResolvedValue({ generatedAt: "2026-05-02T00:00:00.000Z" });
    loadGridmasterCompliance.mockResolvedValue({ generatedAt: "2026-05-02T00:00:00.000Z" });
  });

  it("keeps oversight endpoints gridmaster-only", async () => {
    requireGridmasterSession.mockResolvedValueOnce({
      response: NextResponse.json({ error: "Unauthorized" }, { status: 403 }),
    });

    const response = await getOverview(
      new NextRequest("http://localhost/api/gridmaster/overview"),
    );

    expect(response.status).toBe(403);
    expect(loadGridmasterOverview).not.toHaveBeenCalled();
  });

  it("loads overview, security, billing, and compliance summaries", async () => {
    const responses = await Promise.all([
      getOverview(new NextRequest("http://localhost/api/gridmaster/overview")),
      getSecurity(new NextRequest("http://localhost/api/gridmaster/security")),
      getBilling(new NextRequest("http://localhost/api/gridmaster/billing")),
      getCompliance(new NextRequest("http://localhost/api/gridmaster/compliance")),
    ]);

    expect(responses.map((response) => response.status)).toEqual([200, 200, 200, 200]);
    expect(loadGridmasterOverview).toHaveBeenCalledWith(serviceClient);
    expect(loadGridmasterSecurity).toHaveBeenCalledWith(serviceClient);
    expect(loadGridmasterBilling).toHaveBeenCalledWith(serviceClient);
    expect(loadGridmasterCompliance).toHaveBeenCalledWith(serviceClient);
  });

  it("validates org-health orgId query and passes valid org filters", async () => {
    const invalid = await getOrgHealth(
      new NextRequest("http://localhost/api/gridmaster/org-health?orgId=bad"),
    );
    expect(invalid.status).toBe(400);

    const orgId = "22222222-2222-4222-8222-222222222222";
    const valid = await getOrgHealth(
      new NextRequest(`http://localhost/api/gridmaster/org-health?orgId=${orgId}`),
    );
    expect(valid.status).toBe(200);
    expect(loadGridmasterOrgHealth).toHaveBeenCalledWith(serviceClient, orgId);
  });
});
