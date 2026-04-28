import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import OrganizationSetupWizard from "@/components/gridmaster/OrganizationSetupWizard";
import {
  createGridmasterOrganizationSetup,
} from "@/features/gridmaster/client";
import { insertEmployee } from "@/features/employees/client";
import type { Organization } from "@/types";

vi.mock("@/features/gridmaster/client", () => ({
  createGridmasterOrganizationSetup: vi.fn(),
}));

vi.mock("@/features/employees/client", () => ({
  insertEmployee: vi.fn(),
}));

vi.mock("@/features/settings/client", () => ({
  upsertFocusArea: vi.fn(),
  saveCertifications: vi.fn(),
  saveOrganizationRoles: vi.fn(),
  saveDepartments: vi.fn(),
  upsertShiftCategory: vi.fn(),
  upsertJobDefinition: vi.fn(),
}));

vi.mock("@/features/organization/client", () => ({
  createOrganizationInvitation: vi.fn(),
  updateOrganizationSettings: vi.fn(),
}));

vi.mock("@/lib/sentry", () => ({
  captureException: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
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
    employeeCount: null,
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
    subscriptionStatus: "trialing",
    trialEndsAt: null,
    subscriptionSeats: null,
    dataRetentionDays: 365,
    featureOverrides: {},
  };
}

describe("OrganizationSetupWizard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createGridmasterOrganizationSetup).mockResolvedValue({
      org: makeOrganization(),
      superAdmin: { kind: "assigned", displayName: "Jane Doe" },
    });
    vi.mocked(insertEmployee).mockResolvedValue({
      id: "emp-1",
      firstName: "Jane",
      lastName: "Doe",
      email: "jane@example.com",
    } as Awaited<ReturnType<typeof insertEmployee>>);
    vi.stubGlobal("fetch", vi.fn(async () => ({
      json: async () => ({ valid: false }),
    })));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("removes editable employee count from org details and shows read-only counts in the employee step", { timeout: 10000 }, async () => {
    const user = userEvent.setup();

    render(<OrganizationSetupWizard onCreated={vi.fn()} onCancel={vi.fn()} />);

    expect(screen.queryByText(/^employee count$/i)).not.toBeInTheDocument();

    await user.type(screen.getByPlaceholderText("Acme Healthcare"), "Acme Health");
    await user.click(screen.getByRole("button", { name: /^next$/i }));

    await user.type(screen.getByPlaceholderText("Jane"), "Jane");
    await user.type(screen.getByPlaceholderText("Doe"), "Doe");
    await user.type(screen.getByPlaceholderText("jane@example.com"), "jane@example.com");

    await user.click(screen.getByRole("button", { name: /create organization/i }));

    expect(await screen.findByRole("button", { name: /continue setup/i })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /continue setup/i }));
    await user.click(screen.getByRole("button", { name: /^skip$/i }));

    const readyInput = await screen.findByLabelText(/employees ready to create/i);
    expect(readyInput).toHaveValue("0");
    expect(readyInput).toHaveAttribute("readonly");
    expect(screen.getByLabelText(/employees already created/i)).toHaveValue("0");

    await user.type(screen.getAllByPlaceholderText("John")[0]!, "Alice");
    expect(screen.getByLabelText(/employees ready to create/i)).toHaveValue("1");
  });
});
