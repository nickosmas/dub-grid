import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import OrganizationSetupWizard from "@/components/gridmaster/OrganizationSetupWizard";
import { createGridmasterOrganizationSetup } from "@/features/gridmaster/client";
import { insertEmployee } from "@/features/employees/client";
import { createOrganizationInvitation } from "@/features/organization/client";
import { toast } from "sonner";
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

const stepUpRun = vi.fn();
const requireCredentialAssurance = vi.fn();
vi.mock("@/hooks/useStepUpAction", () => ({
  useStepUpAction: () => ({ run: stepUpRun, dialog: null }),
}));
vi.mock("@/features/account/client", () => ({
  requireCredentialAssurance: (...args: unknown[]) => requireCredentialAssurance(...args),
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
    defaultShiftEnabled: true,
    openShiftVisibility: { coverageGap: "matched", calloff: "matched" },
    stripeCustomerId: null,
    subscriptionStatus: "trialing",
    trialEndsAt: null,
    subscriptionSeats: null,
    dataRetentionDays: 365,
    featureOverrides: {},
    workspaceKind: "real",
    sandboxOwnerUserId: null,
    sandboxSourceOrgId: null,
  };
}

describe("OrganizationSetupWizard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stepUpRun.mockImplementation(async (action: (token: string) => Promise<unknown>) => {
      await action("fresh-token");
      return true;
    });
    requireCredentialAssurance.mockResolvedValue({ success: true });
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
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        json: async () => ({ valid: false }),
      })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("labels the details and super admin fields for assistive technology", async () => {
    const user = userEvent.setup();
    render(<OrganizationSetupWizard onCreated={vi.fn()} onCancel={vi.fn()} />);

    expect(screen.getByLabelText(/organization name/i)).toHaveAttribute(
      "placeholder",
      "Acme Healthcare",
    );
    expect(screen.getByLabelText(/focus areas label/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/certifications label/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/roles label/i)).toBeInTheDocument();

    await user.type(screen.getByLabelText(/organization name/i), "Acme Health");
    await user.click(screen.getByRole("button", { name: /^next$/i }));

    expect(screen.getByLabelText(/first name/i)).toHaveAttribute("placeholder", "Jane");
    expect(screen.getByLabelText(/last name/i)).toHaveAttribute("placeholder", "Doe");
    expect(screen.getByLabelText(/^email/i)).toHaveAttribute("type", "email");
    expect(screen.getByLabelText(/phone/i)).toHaveAttribute("type", "tel");
  });

  it(
    "removes editable employee count from org details and shows read-only counts in the employee step",
    { timeout: 10000 },
    async () => {
      const user = userEvent.setup();

      render(<OrganizationSetupWizard onCreated={vi.fn()} onCancel={vi.fn()} />);

      expect(screen.queryByText(/^employee count$/i)).not.toBeInTheDocument();

      await user.type(screen.getByPlaceholderText("Acme Healthcare"), "Acme Health");
      await user.click(screen.getByRole("button", { name: /^next$/i }));

      await user.type(screen.getByPlaceholderText("Jane"), "Jane");
      await user.type(screen.getByPlaceholderText("Doe"), "Doe");
      await user.type(screen.getByPlaceholderText("jane@example.com"), "jane@example.com");

      await user.click(screen.getByRole("button", { name: /create organization/i }));
      await user.click(
        within(screen.getByRole("dialog")).getByRole("button", { name: /^create organization$/i }),
      );

      expect(await screen.findByRole("button", { name: /set up now/i })).toBeInTheDocument();
      // Naming a Super Admin grants the role, so setup ran with fresh proof (41d4).
      expect(requireCredentialAssurance).toHaveBeenCalledWith("fresh-token");
      expect(vi.mocked(createGridmasterOrganizationSetup)).toHaveBeenCalledWith(
        expect.objectContaining({ superAdminEmail: "jane@example.com" }),
        "fresh-token",
      );

      await user.click(screen.getByRole("button", { name: /set up now/i }));
      expect(screen.getAllByText(/select scheduled department/i).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/select focus area/i).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/select shift/i).length).toBeGreaterThan(0);
      expect(screen.queryByPlaceholderText("e.g. RN")).not.toBeInTheDocument();
      expect(screen.queryByPlaceholderText("e.g. CN")).not.toBeInTheDocument();

      await user.click(screen.getByRole("radio", { name: /full name/i }));
      expect(screen.queryByPlaceholderText("e.g. SUP")).not.toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: /^skip$/i }));

      const readyInput = await screen.findByLabelText(/employees ready to create/i);
      expect(readyInput).toHaveValue("0");
      expect(readyInput).toHaveAttribute("readonly");
      expect(screen.getByLabelText(/employees already created/i)).toHaveValue("0");

      await user.type(screen.getAllByPlaceholderText("John")[0]!, "Alice");
      expect(screen.getByLabelText(/employees ready to create/i)).toHaveValue("1");
    },
  );

  it(
    "finishes nothing and reports no invitations when step-up is cancelled at the invitations step (F-69)",
    { timeout: 15000 },
    async () => {
      const user = userEvent.setup();
      const onCreated = vi.fn();
      render(<OrganizationSetupWizard onCreated={onCreated} onCancel={vi.fn()} />);

      await user.type(screen.getByPlaceholderText("Acme Healthcare"), "Acme Health");
      await user.click(screen.getByRole("button", { name: /^next$/i }));
      await user.type(screen.getByPlaceholderText("Jane"), "Jane");
      await user.type(screen.getByPlaceholderText("Doe"), "Doe");
      await user.type(screen.getByPlaceholderText("jane@example.com"), "jane@example.com");
      await user.click(screen.getByRole("button", { name: /create organization/i }));
      await user.click(
        within(screen.getByRole("dialog")).getByRole("button", { name: /^create organization$/i }),
      );
      await user.click(await screen.findByRole("button", { name: /set up now/i }));
      await user.click(screen.getByRole("button", { name: /^skip$/i }));

      await user.type((await screen.findAllByPlaceholderText("John"))[0]!, "Jane");
      await user.click(screen.getByRole("button", { name: /^create 1 employee$/i }));
      await user.click(
        within(screen.getByRole("dialog")).getByRole("button", { name: /^create employees$/i }),
      );

      // The invitation step's proof is stale: the dialog opens and is dismissed.
      stepUpRun.mockImplementation(async (action: (token: string) => Promise<unknown>) => {
        await action("stale-token").catch(() => undefined);
        return false;
      });
      requireCredentialAssurance.mockRejectedValue(
        Object.assign(new Error("x"), {
          status: 403,
          code: "STEP_UP_REQUIRED",
          method: "password",
        }),
      );
      vi.mocked(toast.success).mockClear();

      await user.click(
        await screen.findByRole("button", { name: /^send 1 invitation & finish$/i }),
      );
      await user.click(
        within(screen.getByRole("dialog")).getByRole("button", { name: /^send invitations$/i }),
      );

      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      expect(requireCredentialAssurance).toHaveBeenLastCalledWith("stale-token");
      expect(vi.mocked(createOrganizationInvitation)).not.toHaveBeenCalled();
      expect(onCreated).not.toHaveBeenCalled();
      expect(toast.success).not.toHaveBeenCalledWith(expect.stringMatching(/^Sent \d+ invitation/));
      expect(toast.error).not.toHaveBeenCalled();
      expect(screen.getByRole("button", { name: /^send 1 invitation & finish$/i })).toBeEnabled();
    },
  );
});
