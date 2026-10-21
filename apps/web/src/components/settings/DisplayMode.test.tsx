import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Organization } from "@/types";

vi.mock("next-themes", () => ({ useTheme: () => ({ resolvedTheme: "light" }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), info: vi.fn(), error: vi.fn() } }));
vi.mock("@/features/organization/client", () => ({
  saveOrganizationSettingsWithRecovery: vi.fn(),
}));

import { saveOrganizationSettingsWithRecovery } from "@/features/organization/client";
import DisplayMode from "./DisplayMode";

function makeOrganization(overrides: Partial<Organization> = {}): Organization {
  return {
    id: "org-1",
    name: "Acme Health",
    slug: "acme-health",
    address: "",
    addressLine1: "",
    addressLine2: "",
    addressCity: "",
    addressState: "",
    addressPostalCode: "",
    addressCountry: "",
    phone: "",
    employeeCount: 12,
    focusAreaLabel: "Focus Areas",
    certificationLabel: "Certifications",
    roleLabel: "Roles",
    departmentLabel: "Departments",
    shiftDisplayMode: "code",
    timezone: "America/Los_Angeles",
    payPeriodStartDate: null,
    enforceConflictPrevention: false,
    defaultShiftEnabled: true,
    openShiftVisibility: { coverageGap: "matched", calloff: "matched" },
    dataRetentionDays: 365,
    featureOverrides: {},
    updatedAt: "2026-04-15T18:00:00.000000+00:00",
    workspaceKind: "real",
    sandboxOwnerUserId: null,
    sandboxSourceOrgId: null,
    ...overrides,
  };
}

describe("DisplayMode: what staff see after a publish (46f)", () => {
  beforeEach(() => {
    vi.mocked(saveOrganizationSettingsWithRecovery).mockReset();
  });

  it.each([
    ["Show staff what changed", { staffSeeShiftChanges: false }],
    ["Show staff who published", { staffSeePublisher: false }],
  ])("saves the %s switch", async (label, saved) => {
    const organization = makeOrganization();
    vi.mocked(saveOrganizationSettingsWithRecovery).mockResolvedValue({
      status: "saved",
      organization: makeOrganization(saved),
    });
    const onSave = vi.fn();
    render(<DisplayMode organization={organization} onSave={onSave} />);

    const toggle = screen.getByRole("switch", { name: label });
    expect(toggle).toHaveAttribute("aria-checked", "true");
    fireEvent.click(toggle);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(saveOrganizationSettingsWithRecovery).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          staffSeeShiftChanges: true,
          staffSeePublisher: true,
          ...saved,
        }),
      }),
    );
  });

  it("says what staff will see once a switch is off", () => {
    render(
      <DisplayMode
        organization={makeOrganization({ staffSeeShiftChanges: false, staffSeePublisher: false })}
        onSave={vi.fn()}
      />,
    );

    expect(
      screen.getByText(
        "Staff see that a shift is new, changed or removed, but not what it was before.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Staff see when the schedule was published, but not who published it."),
    ).toBeInTheDocument();
  });
});
