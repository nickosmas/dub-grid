import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import OrgDetailsStep from "@/components/onboarding/steps/OrgDetailsStep";
import type { Organization } from "@/types";

const useOrganizationDataMock = vi.fn();
const useEmployeeCountMock = vi.fn();

vi.mock("@/hooks", async () => {
  const actual = await vi.importActual<typeof import("@/hooks")>("@/hooks");
  return {
    ...actual,
    useOrganizationData: () => useOrganizationDataMock(),
    useEmployeeCount: () => useEmployeeCountMock(),
    useMediaQuery: () => false,
  };
});

vi.mock("@/lib/db", () => ({
  updateOrganization: vi.fn(),
}));

function makeOrganization(): Organization {
  return {
    id: "org-1",
    name: "Acme Health",
    slug: "acme-health",
    address: "123 Main St, San Francisco, CA 94108, United States",
    addressLine1: "123 Main St",
    addressLine2: "",
    addressCity: "San Francisco",
    addressState: "CA",
    addressPostalCode: "94108",
    addressCountry: "United States",
    phone: "555-0100",
    employeeCount: 42,
    focusAreaLabel: "Focus Areas",
    certificationLabel: "Certifications",
    roleLabel: "Roles",
    departmentLabel: "Departments",
    shiftDisplayMode: "code",
    timezone: "America/Los_Angeles",
    payPeriodStartDate: null,
    archivedAt: null,
    suspendedAt: null,
    suspendedReason: null,
    enforceConflictPrevention: false,
    stripeCustomerId: null,
    subscriptionStatus: "active",
    trialEndsAt: null,
    subscriptionSeats: null,
    dataRetentionDays: 365,
    featureOverrides: {},
  };
}

describe("OrgDetailsStep", () => {
  beforeEach(() => {
    useOrganizationDataMock.mockReturnValue({
      org: makeOrganization(),
      setOrg: vi.fn(),
    });
    useEmployeeCountMock.mockReturnValue({
      employeeCount: 42,
      loading: false,
    });
  });

  it("renders the structured address fields and a read-only employee count", () => {
    render(<OrgDetailsStep onNext={vi.fn()} onBack={vi.fn()} />);

    expect(screen.getByText(/address line 1/i)).toBeInTheDocument();
    expect(screen.queryByText(/^number of employees$/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/employees/i)).toHaveValue("42");
    expect(screen.getByLabelText(/employees/i)).toHaveAttribute("readonly");
  });
});
