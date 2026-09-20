import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Indicators from "@/components/settings/Indicators";
import CoverageRequirementsSettings from "@/components/settings/Coverage";
import DisplayMode from "@/components/settings/DisplayMode";
import ScheduleRules from "@/components/settings/ScheduleRules";
import OrganizationGeneral from "@/components/settings/OrganizationGeneral";
import OrganizationLabels from "@/components/settings/OrganizationLabels";
import StringListSettings from "@/components/settings/StringListSettings";
import DepartmentsSettings from "@/components/settings/DepartmentsSettings";
import ShiftCategoriesSettings from "@/components/settings/ShiftCategories";
import JobsSettings from "@/components/settings/Jobs";
import AbsenceTypesSettings from "@/components/settings/AbsenceTypes";
import {
  saveCoverageRequirements,
  saveDepartments,
  upsertFocusArea,
  upsertIndicatorType,
  upsertJobDefinition,
  upsertShiftCategory,
} from "@/features/settings/client";
import {
  saveOrganizationSettingsWithRecovery,
  updateOrganizationSettings,
} from "@/features/organization/client";
import {
  makeCoverageRequirement,
  makeDepartment,
  makeFocusArea,
  makeShiftCategory,
  makeAssignmentDefinition,
} from "./factories";
import { DEFAULT_SHIFT_JOB_SYSTEM_KEY } from "@/lib/system-jobs";
import type {
  AbsenceType,
  Department,
  FocusArea,
  IndicatorType,
  JobDefinition,
  NamedItem,
  Organization,
  ShiftCategory,
} from "@/types";

vi.mock("@/features/organization/client", () => ({
  updateOrganizationSettings: vi.fn(),
  saveOrganizationSettingsWithRecovery: vi.fn(),
  OrganizationSettingsConflictError: class OrganizationSettingsConflictError extends Error {
    latestOrganization: Organization;

    constructor(latestOrganization: Organization) {
      super("Organization settings were updated by someone else.");
      this.latestOrganization = latestOrganization;
      this.name = "OrganizationSettingsConflictError";
    }
  },
}));

vi.mock("@/features/settings/client", () => ({
  upsertIndicatorType: vi.fn(),
  deleteIndicatorType: vi.fn(),
  saveDepartments: vi.fn(),
  saveCoverageRequirements: vi.fn(),
  upsertFocusArea: vi.fn(),
  deleteFocusArea: vi.fn(),
  checkDepartmentDependencies: vi.fn(),
  upsertAssignmentDefinition: vi.fn(),
  deleteAssignmentDefinition: vi.fn(),
  upsertAbsenceType: vi.fn(),
  deleteAbsenceType: vi.fn(),
  checkAssignmentDefinitionDependencies: vi.fn(),
  checkAbsenceTypeDependencies: vi.fn(),
  upsertShiftCategory: vi.fn(),
  deleteShiftCategory: vi.fn(),
  checkShiftCategoryDependencies: vi.fn(),
  upsertJobDefinition: vi.fn(),
  deleteJobDefinition: vi.fn(),
  checkJobDependencies: vi.fn(),
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

vi.mock("@/hooks", () => ({
  useMediaQuery: () => false,
  useEmployeeCount: () => ({ employeeCount: 42, loading: false }),
  MOBILE: "(max-width: 767px)",
}));

const baseOrganization: Organization = {
  id: "org-1",
  name: "Acme Health",
  slug: "acme-health",
  address: "123 Main St, Springfield, CA 90210, United States",
  addressLine1: "123 Main St",
  addressLine2: "",
  addressCity: "Springfield",
  addressState: "CA",
  addressPostalCode: "90210",
  addressCountry: "United States",
  phone: "(415) 555-0100",
  employeeCount: 42,
  focusAreaLabel: "Focus Areas",
  certificationLabel: "Certifications",
  roleLabel: "Roles",
  departmentLabel: "Departments",
  shiftDisplayMode: "code",
  timezone: "America/Los_Angeles",
  payPeriodStartDate: null,
  enforceConflictPrevention: true,
  defaultShiftEnabled: true,
  openShiftVisibility: { coverageGap: "matched", calloff: "matched" },
  dataRetentionDays: 90,
  featureOverrides: {},
  workspaceKind: "real",
  sandboxOwnerUserId: null,
  sandboxSourceOrgId: null,
  updatedAt: "2026-04-15T18:00:00.000000+00:00",
};

describe("settings dirty save controls", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(saveOrganizationSettingsWithRecovery).mockImplementation(async ({ input }) => ({
      status: "saved",
      organization: await vi.mocked(updateOrganizationSettings)(input),
    }));
  });

  it("organization settings only show Discard while the draft is dirty", async () => {
    const user = userEvent.setup();

    render(<OrganizationGeneral organization={baseOrganization} onSave={vi.fn()} />);

    const nameInput = screen.getByDisplayValue("Acme Health");
    const saveButton = screen.getByRole("button", { name: /review & save/i });
    expect(saveButton).toBeDisabled();
    expect(screen.queryByRole("button", { name: /^discard$/i })).not.toBeInTheDocument();

    await user.clear(nameInput);
    await user.type(nameInput, "Acme North");

    const discardButton = screen.getByRole("button", { name: /^discard$/i });
    expect(saveButton).toBeEnabled();
    expect(discardButton).toBeEnabled();

    await user.click(discardButton);

    expect(screen.getByDisplayValue("Acme Health")).toBeInTheDocument();
    expect(saveButton).toBeDisabled();
    expect(screen.queryByRole("button", { name: /^discard$/i })).not.toBeInTheDocument();
  });

  it("organization settings require review before the guarded save runs", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    const updatedOrganization = {
      ...baseOrganization,
      name: "Acme North",
      updatedAt: "2026-04-15T18:05:00.000000+00:00",
    };

    vi.mocked(updateOrganizationSettings).mockResolvedValue(updatedOrganization);

    render(<OrganizationGeneral organization={baseOrganization} onSave={onSave} />);

    const nameInput = screen.getByDisplayValue("Acme Health");
    await user.clear(nameInput);
    await user.type(nameInput, "Acme North");

    await user.click(screen.getByRole("button", { name: /review & save/i }));

    expect(screen.getByText(/review organization changes/i)).toBeInTheDocument();
    expect(screen.getByText("Organization Name")).toBeInTheDocument();
    expect(updateOrganizationSettings).not.toHaveBeenCalled();

    const reviewDialog = await screen.findByRole("dialog", {
      name: /review organization changes/i,
    });
    await user.click(within(reviewDialog).getByRole("button", { name: /^save$/i }));

    await waitFor(() => {
      expect(updateOrganizationSettings).toHaveBeenCalledWith(
        expect.objectContaining({
          orgId: "org-1",
          expectedUpdatedAt: baseOrganization.updatedAt,
          name: "Acme North",
        }),
      );
    });
    expect(onSave).toHaveBeenCalledWith(updatedOrganization);
  });

  it("organization settings block review when the phone number is invalid", async () => {
    const user = userEvent.setup();

    render(<OrganizationGeneral organization={baseOrganization} onSave={vi.fn()} />);

    const phoneInput = screen.getByLabelText("Phone");
    await user.clear(phoneInput);
    await user.type(phoneInput, "123");

    expect(screen.getByText("Enter a 10-digit US phone number")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /review & save/i })).toBeDisabled();
  });

  it("organization labels only show Discard while the labels are dirty", async () => {
    const user = userEvent.setup();

    render(<OrganizationLabels organization={baseOrganization} onSave={vi.fn()} />);

    const labelInput = screen.getByDisplayValue("Focus Areas");
    const saveButton = screen.getByRole("button", { name: /^save$/i });
    expect(screen.queryByRole("button", { name: /^discard$/i })).not.toBeInTheDocument();

    await user.clear(labelInput);
    await user.type(labelInput, "Units");

    const discardButton = screen.getByRole("button", { name: /^discard$/i });
    expect(saveButton).toBeEnabled();
    expect(discardButton).toBeEnabled();

    await user.click(discardButton);

    expect(screen.getByDisplayValue("Focus Areas")).toBeInTheDocument();
    expect(saveButton).toBeDisabled();
    expect(screen.queryByRole("button", { name: /^discard$/i })).not.toBeInTheDocument();
  });

  it("custom labels does not expose a Scheduled Departments field — that label is fixed", () => {
    render(<OrganizationLabels organization={baseOrganization} onSave={vi.fn()} />);

    expect(screen.queryByText("SCHEDULED DEPARTMENTS LABEL")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Scheduled only. Does not rename management departments."),
    ).not.toBeInTheDocument();
    // The other three labels remain customizable.
    expect(screen.getByText("Focus areas label")).toBeInTheDocument();
    expect(screen.getByText("Certifications label")).toBeInTheDocument();
    expect(screen.getByText("Roles label")).toBeInTheDocument();
  });

  it("display mode uses Cancel while the mode selection is dirty", async () => {
    const user = userEvent.setup();

    render(<DisplayMode organization={baseOrganization} onSave={vi.fn()} />);

    const saveButton = screen.getByRole("button", { name: /^save$/i });
    const codeSample = document.querySelector('[data-display-mode-sample="code"]');
    const codeSampleStaffHeader = document.querySelector(
      '[data-display-mode-sample-staff-header="true"]',
    );
    const optionsGrid = document.querySelector<HTMLElement>("[data-display-mode-options]");
    const codeOption = screen.getByRole("button", { name: /short codes/i });
    const fullNameOption = screen.getByRole("button", { name: /full names/i });
    expect(saveButton).toBeDisabled();
    expect(codeSample).not.toBeNull();
    expect(codeSampleStaffHeader).not.toBeNull();
    expect(optionsGrid).toHaveStyle({
      gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 420px), 1fr))",
    });
    for (const option of [codeOption, fullNameOption]) {
      expect(option).toHaveStyle({
        width: "100%",
        minWidth: "0",
        maxWidth: "100%",
        whiteSpace: "normal",
        overflow: "hidden",
      });
    }
    expect(codeSampleStaffHeader).toHaveStyle({
      position: "relative",
      zIndex: "2",
    });
    expect(codeSample?.querySelector('.dg-grid-slot[data-leading-divider="split"]')).not.toBeNull();
    expect(codeSample?.querySelector('.dg-grid-cell[data-top-divider="dark"]')).not.toBeNull();
    expect(screen.queryByRole("button", { name: /^cancel$/i })).not.toBeInTheDocument();
    expect(codeOption).toHaveAttribute("aria-pressed", "true");

    await user.click(fullNameOption);

    const cancelButton = screen.getByRole("button", { name: /^cancel$/i });
    expect(screen.getByText(/choose a display mode/i)).toBeInTheDocument();
    expect(saveButton).toBeEnabled();
    expect(cancelButton).toBeEnabled();
    expect(screen.getByRole("button", { name: /short codes/i })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(screen.getByRole("button", { name: /full names/i })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    await user.click(cancelButton);

    expect(screen.getByText(/choose a display mode/i)).toBeInTheDocument();
    expect(saveButton).toBeDisabled();
    expect(screen.queryByRole("button", { name: /^cancel$/i })).not.toBeInTheDocument();
  });

  it("saves the appwide compact role and certification label preference", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    vi.mocked(saveOrganizationSettingsWithRecovery).mockResolvedValue({
      status: "saved",
      organization: { ...baseOrganization, useCompactRoleCertificationLabels: true },
    });

    render(<DisplayMode organization={baseOrganization} onSave={onSave} />);

    const compactLabelsSwitch = screen.getByRole("switch", {
      name: /use compact role and certification labels/i,
    });
    expect(compactLabelsSwitch).toHaveAttribute("aria-checked", "false");

    await user.click(compactLabelsSwitch);
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    expect(saveOrganizationSettingsWithRecovery).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({ useCompactRoleCertificationLabels: true }),
      }),
    );
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ useCompactRoleCertificationLabels: true }),
    );
  });

  it("schedule rules only expose Save for a modified toggle", async () => {
    const user = userEvent.setup();

    render(<ScheduleRules organization={baseOrganization} onOrganizationSave={vi.fn()} />);

    const toggle = screen.getByRole("switch", {
      name: /enforce shift conflict prevention/i,
    });
    const saveButton = screen.getByRole("button", { name: /^save$/i });

    expect(saveButton).toBeDisabled();
    expect(screen.queryByRole("button", { name: /^cancel$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^close$/i })).not.toBeInTheDocument();

    await user.click(toggle);

    expect(saveButton).toBeEnabled();
    expect(screen.queryByRole("button", { name: /^cancel$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^close$/i })).not.toBeInTheDocument();
  });

  it("gives schedule rules distinct titles, descriptions, and divided rows", () => {
    const { container } = render(
      <ScheduleRules organization={baseOrganization} onOrganizationSave={vi.fn()} />,
    );

    const title = screen.getByText("Enforce shift conflict prevention");
    const description = screen.getByText("When enabled, overlapping shifts cannot be saved.");
    const rows = container.querySelectorAll("[data-schedule-rule-row]");

    expect(title).toHaveStyle({
      color: "var(--dg-color-text-primary)",
      fontSize: "var(--dg-fs-body-sm)",
      fontWeight: "600",
    });
    expect(description).toHaveStyle({
      color: "var(--dg-color-text-muted)",
      fontSize: "var(--dg-type-field-title-size)",
      fontWeight: "400",
    });
    expect(rows).toHaveLength(5);
    for (const row of Array.from(rows).slice(1)) {
      expect(row.getAttribute("style")).toContain(
        "border-top: 1px solid var(--dg-color-border-light)",
      );
    }
  });

  it("schedule rules save a biweekly pay-period anchor date", async () => {
    const user = userEvent.setup();
    const onOrganizationSave = vi.fn();
    const organization = {
      ...baseOrganization,
      payPeriodStartDate: "2026-04-15",
    };

    vi.mocked(updateOrganizationSettings).mockResolvedValue({
      ...organization,
      payPeriodStartDate: "2026-04-20",
    });

    const { container } = render(
      <ScheduleRules organization={organization} onOrganizationSave={onOrganizationSave} />,
    );

    expect(container.querySelector('input[type="date"]')).toBeNull();

    await user.click(
      screen.getByRole("button", {
        name: /biweekly pay period start date/i,
      }),
    );
    expect(screen.getByLabelText("Biweekly pay period start date calendar")).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", {
        name: /choose monday, april 20, 2026/i,
      }),
    );

    await user.click(screen.getByRole("button", { name: /^save$/i }));
    // The page's Save and the dialog's confirm are both "Save" now, so scope
    // the confirm to the dialog rather than matching whichever comes first.
    const ruleDialog = await screen.findByRole("dialog", { name: /save schedule rule/i });
    await user.click(within(ruleDialog).getByRole("button", { name: /^save$/i }));

    await waitFor(() => {
      expect(updateOrganizationSettings).toHaveBeenCalledWith(
        expect.objectContaining({
          orgId: "org-1",
          payPeriodStartDate: "2026-04-20",
        }),
      );
    });
    expect(onOrganizationSave).toHaveBeenCalledWith(
      expect.objectContaining({
        payPeriodStartDate: "2026-04-20",
      }),
    );
  });

  it("disables indicator Save until a row changes, then closes the editor after save", async () => {
    const user = userEvent.setup();
    const indicator: IndicatorType = {
      id: 1,
      orgId: "org-1",
      name: "Readings",
      color: "#ff0000",
      sortOrder: 0,
    };

    vi.mocked(upsertIndicatorType).mockResolvedValue(indicator);

    render(
      <Indicators
        indicatorTypes={[indicator]}
        orgId="org-1"
        onChange={vi.fn()}
        canManageIndicatorTypes
      />,
    );

    await user.click(screen.getByText("Readings"));

    const saveButton = screen.getByRole("button", { name: /^save$/i });
    expect(saveButton).toBeDisabled();
    expect(screen.getByRole("button", { name: /^close$/i })).toBeInTheDocument();

    const input = screen.getByDisplayValue("Readings");
    await user.clear(input);
    await user.type(input, "Daily Readings");
    expect(saveButton).toBeEnabled();
    expect(screen.getByRole("button", { name: /^discard$/i })).toBeInTheDocument();

    vi.mocked(upsertIndicatorType).mockResolvedValue({
      ...indicator,
      name: "Daily Readings",
    });

    await user.click(saveButton);

    // A successful save collapses the editor shut, so its Save / Close /
    // Discard controls are no longer present.
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /^save$/i })).not.toBeInTheDocument();
    });
    expect(screen.queryByRole("button", { name: /^close$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^discard$/i })).not.toBeInTheDocument();
  });

  it("indicator rows swap Close for Discard and keep the editor open after discard", async () => {
    const user = userEvent.setup();
    const indicator: IndicatorType = {
      id: 1,
      orgId: "org-1",
      name: "Readings",
      color: "#ff0000",
      sortOrder: 0,
    };

    render(
      <Indicators
        indicatorTypes={[indicator]}
        orgId="org-1"
        onChange={vi.fn()}
        canManageIndicatorTypes
      />,
    );

    await user.click(screen.getByText("Readings"));

    const input = screen.getByDisplayValue("Readings");
    const saveButton = screen.getByRole("button", { name: /^save$/i });
    expect(screen.getByRole("button", { name: /^close$/i })).toBeInTheDocument();
    expect(saveButton).toBeDisabled();
    expect(screen.queryByRole("button", { name: /^discard$/i })).not.toBeInTheDocument();

    await user.clear(input);
    await user.type(input, "Daily Readings");

    const cancelButton = screen.getByRole("button", { name: /^discard$/i });
    expect(saveButton).toBeEnabled();
    expect(cancelButton).toBeEnabled();

    await user.click(cancelButton);

    expect(screen.getByDisplayValue("Readings")).toBeInTheDocument();
    expect(saveButton).toBeDisabled();
    expect(screen.getByRole("button", { name: /^close$/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^discard$/i })).not.toBeInTheDocument();
  });

  it("Add Indicator shows Cancel on a pristine new row, and Cancel removes the draft", async () => {
    const user = userEvent.setup();

    render(
      <Indicators indicatorTypes={[]} orgId="org-1" onChange={vi.fn()} canManageIndicatorTypes />,
    );

    await user.click(screen.getByRole("button", { name: /\+ add indicator/i }));

    expect(screen.getByRole("button", { name: /^cancel$/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^discard$/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^cancel$/i }));

    expect(screen.queryByPlaceholderText("e.g. Readings")).not.toBeInTheDocument();
  });

  it("indicator rows prompt before discarding a dirty edit on collapse", async () => {
    const user = userEvent.setup();
    const indicator: IndicatorType = {
      id: 1,
      orgId: "org-1",
      name: "Readings",
      color: "#ff0000",
      sortOrder: 0,
    };

    render(
      <Indicators
        indicatorTypes={[indicator]}
        orgId="org-1"
        onChange={vi.fn()}
        canManageIndicatorTypes
      />,
    );

    await user.click(screen.getByText("Readings"));

    const input = screen.getByDisplayValue("Readings");
    await user.clear(input);
    await user.type(input, "Daily Readings");

    // Clicking the row header again while dirty should prompt before closing.
    await user.click(screen.getByText("Daily Readings"));

    expect(await screen.findByRole("dialog", { name: /unsaved changes/i })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /keep editing/i }));

    expect(screen.queryByRole("dialog", { name: /unsaved changes/i })).not.toBeInTheDocument();
    expect(screen.getByDisplayValue("Daily Readings")).toBeInTheDocument();
  });

  it("indicator rows keep actions in a footer after the field row", async () => {
    const indicator: IndicatorType = {
      id: 1,
      orgId: "org-1",
      name: "Readings",
      color: "#ff0000",
      sortOrder: 0,
    };

    render(
      <Indicators
        indicatorTypes={[indicator]}
        orgId="org-1"
        onChange={vi.fn()}
        canManageIndicatorTypes
      />,
    );

    await userEvent.setup().click(screen.getByText("Readings"));

    const input = screen.getByDisplayValue("Readings");
    const saveButton = screen.getByRole("button", { name: /^save$/i });
    const inputRow = input.closest("div");
    const actionRow = saveButton.parentElement;

    expect(inputRow).not.toBeNull();
    expect(actionRow).not.toBeNull();
    expect(inputRow).not.toBe(actionRow);
    const relation = inputRow?.compareDocumentPosition(actionRow as Node) ?? 0;
    expect(relation & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("string list edit mode swaps Close for Discard after edits", async () => {
    const user = userEvent.setup();

    render(
      <StringListSettings
        label="Certifications"
        items={[{ id: 1, orgId: "org-1", name: "RN", abbr: "RN", sortOrder: 0 }]}
        onSave={vi.fn().mockResolvedValue(undefined)}
        placeholder="Certification"
        initialEditing
      />,
    );

    expect(screen.getByRole("button", { name: /^close$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^save$/i })).toBeDisabled();

    const input = screen.getByPlaceholderText("Full name");
    await user.clear(input);
    await user.type(input, "Charge Nurse");

    expect(screen.getByRole("button", { name: /^discard$/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^close$/i })).not.toBeInTheDocument();
  });

  it("coverage edit mode reveals Discard alongside Save once a draft is dirty", async () => {
    const user = userEvent.setup();
    const focusArea = makeFocusArea({ id: 1, orgId: "org-1", name: "ICU" });
    const shiftCategory = makeShiftCategory({
      id: 10,
      orgId: "org-1",
      name: "Days",
      focusAreaId: 1,
    });
    const job: JobDefinition = {
      id: 200,
      orgId: "org-1",
      name: "Supervisor",
      abbr: "SUP",
      showOnGrid: true,
      focusAreaId: 1,
      applicableShiftIds: [10],
      eligibleRoleIds: [],
      requiredCertificationIds: [],
      color: "#bfdbfe",
      border: "#1d4ed8",
      text: "#1d4ed8",
      sortOrder: 1,
      assignmentMode: "with_shift",
      systemKey: null,
      archivedAt: null,
    };
    const assignment = makeAssignmentDefinition({
      id: 100,
      orgId: "org-1",
      label: "Ds",
      name: "Day Supervisor",
      categoryId: 10,
      shiftId: 10,
      jobId: 200,
      focusAreaId: 1,
    });
    const requirement = makeCoverageRequirement({
      id: 50,
      orgId: "org-1",
      focusAreaId: 1,
      jobId: 200,
      preferredShiftId: 10,
      assignmentId: 100,
      minStaff: 2,
    });

    vi.mocked(saveCoverageRequirements).mockResolvedValue([requirement]);

    render(
      <CoverageRequirementsSettings
        orgId="org-1"
        focusAreas={[focusArea]}
        shiftCategories={[shiftCategory]}
        jobs={[job]}
        coverageRequirements={[requirement]}
        onCoverageRequirementsChange={vi.fn()}
        canEdit
      />,
    );

    const coverageToggle = screen
      .getAllByRole("button")
      .find((button) => button.getAttribute("aria-expanded") === "false");

    expect(coverageToggle).toBeDefined();
    await user.click(coverageToggle!);

    const staffInput = await screen.findByRole("spinbutton");
    const saveButton = screen.getByRole("button", { name: /^save$/i });

    expect(
      staffInput.compareDocumentPosition(saveButton) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^discard$/i })).not.toBeInTheDocument();

    await user.clear(staffInput);
    await user.type(staffInput, "3");
    const discardButton = screen.getByRole("button", { name: /^discard$/i });
    expect(discardButton).toBeInTheDocument();
    expect(
      discardButton.compareDocumentPosition(saveButton) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    await user.click(discardButton);

    expect(screen.getByRole("spinbutton")).toHaveValue("2");
    expect(screen.queryByRole("button", { name: /^discard$/i })).not.toBeInTheDocument();
  });

  it("coverage defaults new requirements to same every day", async () => {
    const user = userEvent.setup();
    const focusArea = makeFocusArea({ id: 1, orgId: "org-1", name: "ICU" });
    const shiftCategory = makeShiftCategory({
      id: 10,
      orgId: "org-1",
      name: "Days",
      focusAreaId: 1,
    });
    const job: JobDefinition = {
      id: 200,
      orgId: "org-1",
      name: "Supervisor",
      abbr: "SUP",
      showOnGrid: true,
      focusAreaId: 1,
      applicableShiftIds: [10],
      eligibleRoleIds: [],
      requiredCertificationIds: [],
      color: "#bfdbfe",
      border: "#1d4ed8",
      text: "#1d4ed8",
      sortOrder: 1,
      assignmentMode: "with_shift",
      systemKey: null,
      archivedAt: null,
    };
    const savedRequirement = makeCoverageRequirement({
      id: 50,
      orgId: "org-1",
      focusAreaId: 1,
      jobId: 200,
      preferredShiftId: 10,
      minStaff: 2,
      dayOfWeek: null,
    });

    vi.mocked(saveCoverageRequirements).mockResolvedValue([savedRequirement]);

    render(
      <CoverageRequirementsSettings
        orgId="org-1"
        focusAreas={[focusArea]}
        shiftCategories={[shiftCategory]}
        jobs={[job]}
        coverageRequirements={[]}
        onCoverageRequirementsChange={vi.fn()}
        canEdit
      />,
    );

    const coverageToggle = screen
      .getAllByRole("button")
      .find((button) => button.getAttribute("aria-expanded") === "false");

    expect(coverageToggle).toBeDefined();
    await user.click(coverageToggle!);

    expect(screen.getByLabelText("Same every day")).toBeChecked();

    const staffInput = await screen.findByRole("spinbutton");
    expect(staffInput).toHaveValue("0");

    await user.clear(staffInput);
    await user.type(staffInput, "2");
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => {
      expect(saveCoverageRequirements).toHaveBeenCalledWith("org-1", 1, 200, 10, [
        { dayOfWeek: null, minStaff: 2 },
      ]);
    });
  });

  it("coverage shows visible scheduled jobs and shift-only demand targets", () => {
    const focusArea = makeFocusArea({
      id: 1,
      orgId: "org-1",
      name: "North Wing",
    });
    const shiftCategory = makeShiftCategory({
      id: 10,
      orgId: "org-1",
      name: "Day Shift",
      abbr: "D",
      focusAreaId: 1,
    });
    const jobs: JobDefinition[] = [
      {
        id: 200,
        orgId: "org-1",
        name: "Regular Staff",
        abbr: "REG",
        showOnGrid: false,
        eligibleRoleIds: [],
        requiredCertificationIds: [],
        color: "#fde68a",
        border: "#854d0e",
        text: "#854d0e",
        sortOrder: 0,
        assignmentMode: "with_shift",
        systemKey: "regular_staff",
        archivedAt: null,
      },
      {
        id: 203,
        orgId: "org-1",
        name: "Default shift job",
        abbr: "SHIFT",
        showOnGrid: false,
        focusAreaId: 1,
        focusAreaIds: [1],
        applicableShiftIds: [10],
        eligibleRoleIds: [],
        requiredCertificationIds: [],
        color: "#e2e8f0",
        border: "#94a3b8",
        text: "#334155",
        sortOrder: -1000,
        assignmentMode: "with_shift",
        systemKey: DEFAULT_SHIFT_JOB_SYSTEM_KEY,
        archivedAt: null,
      },
      {
        id: 201,
        orgId: "org-1",
        name: "Supervisor",
        abbr: "SUP",
        showOnGrid: true,
        focusAreaId: 1,
        applicableShiftIds: [10],
        eligibleRoleIds: [],
        requiredCertificationIds: [],
        color: "#bfdbfe",
        border: "#1d4ed8",
        text: "#1d4ed8",
        sortOrder: 1,
        assignmentMode: "with_shift",
        systemKey: null,
        archivedAt: null,
      },
      {
        id: 202,
        orgId: "org-1",
        name: "Office",
        abbr: "Ofc",
        showOnGrid: true,
        eligibleRoleIds: [],
        requiredCertificationIds: [],
        color: "#e2e8f0",
        border: "#94a3b8",
        text: "#334155",
        sortOrder: 2,
        assignmentMode: "shiftless",
        systemKey: null,
        archivedAt: null,
      },
    ];
    const assignments = [
      makeAssignmentDefinition({
        id: 100,
        orgId: "org-1",
        label: "D",
        name: "Day",
        categoryId: 10,
        shiftId: 10,
        jobId: 200,
        focusAreaId: 1,
        sortOrder: 0,
      }),
      makeAssignmentDefinition({
        id: 101,
        orgId: "org-1",
        label: "Ds",
        name: "Day Supervisor",
        categoryId: 10,
        shiftId: 10,
        jobId: 201,
        focusAreaId: 1,
        sortOrder: 1,
      }),
      makeAssignmentDefinition({
        id: 102,
        orgId: "org-1",
        label: "Ofc",
        name: "Office",
        categoryId: null,
        shiftId: null,
        jobId: 202,
        isGeneral: true,
        focusAreaId: null,
        sortOrder: 2,
      }),
    ];

    render(
      <CoverageRequirementsSettings
        orgId="org-1"
        focusAreas={[focusArea]}
        shiftCategories={[shiftCategory]}
        jobs={jobs}
        coverageRequirements={[]}
        onCoverageRequirementsChange={vi.fn()}
        canEdit
      />,
    );

    expect(screen.getAllByText("Day Shift").length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText(/^D$/)).not.toBeInTheDocument();
    expect(screen.queryByText("Regular Staff")).not.toBeInTheDocument();
    expect(screen.queryByText("Default shift job")).not.toBeInTheDocument();
    expect(screen.queryAllByText("Supervisor").length).toBeGreaterThan(0);
    expect(screen.queryByText("General shiftless jobs")).not.toBeInTheDocument();
    expect(screen.queryByText("Office")).not.toBeInTheDocument();
    expect(screen.queryByText(/^Day Shift · Supervisor$/)).not.toBeInTheDocument();
  });

  it("coverage saves shift-only demand against the default shift job", async () => {
    const user = userEvent.setup();
    const focusArea = makeFocusArea({
      id: 1,
      orgId: "org-1",
      name: "North Wing",
    });
    const shiftCategory = makeShiftCategory({
      id: 10,
      orgId: "org-1",
      name: "Day Shift",
      abbr: "D",
      focusAreaId: 1,
    });
    const defaultShiftJob: JobDefinition = {
      id: 203,
      orgId: "org-1",
      name: "Default shift job",
      abbr: "SHIFT",
      showOnGrid: false,
      focusAreaId: 1,
      focusAreaIds: [1],
      applicableShiftIds: [10],
      eligibleRoleIds: [],
      requiredCertificationIds: [],
      color: "#e2e8f0",
      border: "#94a3b8",
      text: "#334155",
      sortOrder: -1000,
      assignmentMode: "with_shift",
      systemKey: DEFAULT_SHIFT_JOB_SYSTEM_KEY,
      archivedAt: null,
    };
    const savedRequirement = makeCoverageRequirement({
      id: 50,
      orgId: "org-1",
      focusAreaId: 1,
      jobId: 203,
      preferredShiftId: 10,
      minStaff: 4,
      dayOfWeek: null,
    });

    vi.mocked(saveCoverageRequirements).mockResolvedValue([savedRequirement]);

    render(
      <CoverageRequirementsSettings
        orgId="org-1"
        focusAreas={[focusArea]}
        shiftCategories={[shiftCategory]}
        jobs={[defaultShiftJob]}
        coverageRequirements={[]}
        onCoverageRequirementsChange={vi.fn()}
        canEdit
      />,
    );

    expect(screen.getAllByText("Day Shift").length).toBeGreaterThan(0);
    expect(screen.queryByText("Default shift job")).not.toBeInTheDocument();

    const coverageToggle = screen
      .getAllByRole("button")
      .find((button) => button.getAttribute("aria-expanded") === "false");

    expect(coverageToggle).toBeDefined();
    await user.click(coverageToggle!);

    const staffInput = await screen.findByRole("spinbutton");
    await user.clear(staffInput);
    await user.type(staffInput, "4");
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => {
      expect(saveCoverageRequirements).toHaveBeenCalledWith("org-1", 1, 203, 10, [
        { dayOfWeek: null, minStaff: 4 },
      ]);
    });
  });

  it("coverage hides row previews and sorts jobs by qualification seniority within each shift", () => {
    const focusArea = makeFocusArea({
      id: 1,
      orgId: "org-1",
      name: "North Wing",
    });
    const shiftCategory = makeShiftCategory({
      id: 10,
      orgId: "org-1",
      name: "Day Shift",
      abbr: "DS",
      focusAreaId: 1,
      sortOrder: 0,
    });
    const orgRoles: NamedItem[] = [
      {
        id: 7,
        orgId: "org-1",
        name: "Supervisor",
        abbr: "SUPV",
        isScheduleRole: true,
        sortOrder: 0,
        departmentIds: [],
      },
      {
        id: 9,
        orgId: "org-1",
        name: "Mentor",
        abbr: "MEN",
        isScheduleRole: true,
        sortOrder: 2,
        departmentIds: [],
      },
    ];
    const jobs: JobDefinition[] = [
      {
        id: 200,
        orgId: "org-1",
        name: "Staff",
        abbr: "STA",
        showOnGrid: true,
        focusAreaId: 1,
        applicableShiftIds: [10],
        eligibleRoleIds: [],
        requiredCertificationIds: [],
        color: "#bfdbfe",
        border: "#1d4ed8",
        text: "#1d4ed8",
        sortOrder: 0,
        assignmentMode: "with_shift",
        systemKey: null,
        archivedAt: null,
      },
      {
        id: 201,
        orgId: "org-1",
        name: "Mentor",
        abbr: "MEN",
        showOnGrid: true,
        focusAreaId: 1,
        applicableShiftIds: [10],
        eligibleRoleIds: [9],
        requiredCertificationIds: [],
        color: "#ddd6fe",
        border: "#7c3aed",
        text: "#5b21b6",
        sortOrder: 1,
        assignmentMode: "with_shift",
        systemKey: null,
        archivedAt: null,
      },
      {
        id: 202,
        orgId: "org-1",
        name: "Supervisor",
        abbr: "SUPV",
        showOnGrid: true,
        focusAreaId: 1,
        applicableShiftIds: [10],
        eligibleRoleIds: [7],
        requiredCertificationIds: [],
        color: "#bfdbfe",
        border: "#1d4ed8",
        text: "#1d4ed8",
        sortOrder: 2,
        assignmentMode: "with_shift",
        systemKey: null,
        archivedAt: null,
      },
    ];
    const assignments = [
      makeAssignmentDefinition({
        id: 100,
        orgId: "org-1",
        label: "DSTA",
        name: "Day Staff",
        categoryId: 10,
        shiftId: 10,
        jobId: 200,
        focusAreaId: 1,
        sortOrder: 0,
      }),
      makeAssignmentDefinition({
        id: 101,
        orgId: "org-1",
        label: "DMEN",
        name: "Day Mentor",
        categoryId: 10,
        shiftId: 10,
        jobId: 201,
        focusAreaId: 1,
        sortOrder: 1,
      }),
      makeAssignmentDefinition({
        id: 102,
        orgId: "org-1",
        label: "DSUPV",
        name: "Day Supervisor",
        categoryId: 10,
        shiftId: 10,
        jobId: 202,
        focusAreaId: 1,
        sortOrder: 2,
      }),
    ];

    render(
      <CoverageRequirementsSettings
        orgId="org-1"
        focusAreas={[focusArea]}
        shiftCategories={[shiftCategory]}
        jobs={jobs}
        orgRoles={orgRoles}
        certifications={[]}
        coverageRequirements={[]}
        onCoverageRequirementsChange={vi.fn()}
        canEdit
      />,
    );

    expect(screen.queryByText(/^STA$/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^SUPV$/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^MEN$/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^DS$/)).not.toBeInTheDocument();

    const supervisorRow = screen.getByText("Supervisor");
    const mentorRow = screen.getByText("Mentor");
    const staffRow = screen.getByText("Staff");

    expect(
      supervisorRow.compareDocumentPosition(mentorRow) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      mentorRow.compareDocumentPosition(staffRow) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("shows Close in clean string list edit mode and swaps to Discard without leaving edit mode", async () => {
    const user = userEvent.setup();
    const items: NamedItem[] = [
      {
        id: 1,
        orgId: "org-1",
        name: "Charge",
        abbr: "CH",
        sortOrder: 0,
        departmentIds: [],
      },
    ];

    render(
      <StringListSettings
        label="Roles"
        items={items}
        onSave={vi.fn()}
        placeholder="Role"
        initialEditing
        sectionTitle="Roles"
      />,
    );

    const input = screen.getByDisplayValue("Charge");
    const cancelButton = screen.getByRole("button", { name: /^close$/i });
    const saveButton = screen.getByRole("button", { name: /^save$/i });
    expect(
      input.compareDocumentPosition(cancelButton) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      cancelButton.compareDocumentPosition(saveButton) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(saveButton).toBeDisabled();

    await user.clear(input);
    await user.type(input, "Lead");
    expect(screen.getByRole("button", { name: /^discard$/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^close$/i })).not.toBeInTheDocument();
    expect(saveButton).toBeEnabled();

    await user.click(screen.getByRole("button", { name: /^discard$/i }));

    expect(screen.getByDisplayValue("Charge")).toBeInTheDocument();
    expect(saveButton).toBeDisabled();
    expect(screen.getByRole("button", { name: /^close$/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^discard$/i })).not.toBeInTheDocument();
  });

  it("keeps a sparse two-column string list card at the standard table width", () => {
    const items: NamedItem[] = [
      {
        id: 1,
        orgId: "org-1",
        name: "Charge Nurse",
        abbr: "CN",
        sortOrder: 0,
        departmentIds: [],
      },
    ];

    const { container } = render(
      <StringListSettings
        label="Roles"
        items={items}
        onSave={vi.fn()}
        placeholder="Role"
        sectionTitle="Roles"
        maxWidth={1120}
      />,
    );

    expect(container.querySelector(".dg-page-enter")).toHaveStyle({
      maxWidth: "1120px",
      margin: "0",
    });
  });

  it("shows Close in clean departments edit mode and swaps to Discard without leaving edit mode", async () => {
    const user = userEvent.setup();
    const departments: Department[] = [
      {
        id: 1,
        orgId: "org-1",
        name: "North",
        abbr: "North",
        type: "scheduled",
        sortOrder: 0,
        archivedAt: null,
      },
    ];
    const focusAreas: FocusArea[] = [];

    render(
      <DepartmentsSettings
        departments={departments}
        focusAreas={focusAreas}
        orgId="org-1"
        focusAreaLabel="Focus Areas"
        departmentLabel="Departments"
        canManageFocusAreas
        onDepartmentsChange={vi.fn()}
        onFocusAreasChange={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: /^edit$/i }));

    const input = screen.getByDisplayValue("North");
    const cancelButton = screen.getByRole("button", { name: /^close$/i });
    const saveButton = screen.getByRole("button", { name: /^save$/i });
    expect(
      input.compareDocumentPosition(cancelButton) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      cancelButton.compareDocumentPosition(saveButton) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(saveButton).toBeDisabled();

    await user.clear(input);
    await user.type(input, "South");
    expect(screen.getByRole("button", { name: /^discard$/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^close$/i })).not.toBeInTheDocument();
    expect(saveButton).toBeEnabled();

    await user.click(screen.getByRole("button", { name: /^discard$/i }));

    expect(screen.getByDisplayValue("North")).toBeInTheDocument();
    expect(saveButton).toBeDisabled();
    expect(screen.getByRole("button", { name: /^close$/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^discard$/i })).not.toBeInTheDocument();
  });

  it("shows scheduled focus areas without requiring expansion in read mode", () => {
    const departments: Department[] = [
      {
        id: 1,
        orgId: "org-1",
        name: "Nursing",
        abbr: "Nursing",
        type: "scheduled",
        sortOrder: 0,
        archivedAt: null,
      },
    ];
    const focusAreas: FocusArea[] = [
      {
        id: 1,
        orgId: "org-1",
        departmentId: 1,
        name: "Cedar Wing",
        color: "#BFDBFE",
        sortOrder: 0,
        archivedAt: null,
      },
      {
        id: 2,
        orgId: "org-1",
        departmentId: 1,
        name: "Birch Wing",
        color: "#A7F3D0",
        sortOrder: 1,
        archivedAt: null,
      },
      {
        id: 3,
        orgId: "org-1",
        departmentId: 1,
        name: "Spruce Wing",
        color: "#FDE68A",
        sortOrder: 2,
        archivedAt: null,
      },
    ];

    render(
      <DepartmentsSettings
        departments={departments}
        focusAreas={focusAreas}
        orgId="org-1"
        focusAreaLabel="Wings"
        departmentLabel="Scheduled Departments"
        canManageFocusAreas
        onDepartmentsChange={vi.fn()}
        onFocusAreasChange={vi.fn()}
      />,
    );

    expect(screen.getByText("3 wings")).toBeInTheDocument();
    expect(screen.getByText("Spruce Wing")).toBeInTheDocument();
  });

  it("offers to add a focus area to a scheduled department that has none", async () => {
    const user = userEvent.setup();
    render(
      <DepartmentsSettings
        departments={[
          makeDepartment({
            id: 1,
            orgId: "org-1",
            name: "Nursing",
            type: "scheduled",
            sortOrder: 0,
          }),
        ]}
        focusAreas={[]}
        orgId="org-1"
        focusAreaLabel="Wings"
        departmentLabel="Scheduled Departments"
        canManageFocusAreas
        onDepartmentsChange={vi.fn()}
        onFocusAreasChange={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: /^edit$/i }));

    expect(screen.getByText(/No wings yet/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "+ Add Wing" })).toBeInTheDocument();
  });

  it("reorders departments from their keyboard handles", async () => {
    const user = userEvent.setup();
    const departments: Department[] = [
      makeDepartment({ id: 1, orgId: "org-1", name: "North", sortOrder: 0 }),
      makeDepartment({ id: 2, orgId: "org-1", name: "South", sortOrder: 1 }),
    ];

    render(
      <DepartmentsSettings
        departments={departments}
        focusAreas={[]}
        orgId="org-1"
        focusAreaLabel="Focus Areas"
        departmentLabel="Departments"
        canManageFocusAreas
        onDepartmentsChange={vi.fn()}
        onFocusAreasChange={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: /^edit$/i }));
    const handle = screen.getByRole("button", { name: /reorder south/i });
    handle.focus();
    await user.keyboard("{ArrowUp}");

    expect(
      screen.getAllByDisplayValue(/North|South/).map((input) => input.getAttribute("value")),
    ).toEqual(["South", "North"]);
  });

  it("does not expose focus area color presets from the departments editor", async () => {
    const user = userEvent.setup();
    const departments: Department[] = [
      {
        id: 1,
        orgId: "org-1",
        name: "North",
        abbr: "North",
        type: "scheduled",
        sortOrder: 0,
        archivedAt: null,
      },
    ];
    const focusAreas: FocusArea[] = [
      {
        id: 2,
        orgId: "org-1",
        departmentId: 1,
        name: "North",
        color: "#BFDBFE",
        sortOrder: 0,
        archivedAt: null,
      },
    ];

    render(
      <DepartmentsSettings
        departments={departments}
        focusAreas={focusAreas}
        orgId="org-1"
        focusAreaLabel="Focus Areas"
        departmentLabel="Scheduled Departments"
        canManageFocusAreas
        onDepartmentsChange={vi.fn()}
        onFocusAreasChange={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: /^edit$/i }));

    expect(screen.queryByRole("button", { name: /color preset/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/^Color$/i)).not.toBeInTheDocument();
  });

  it("shift category editors prompt before switching away from dirty edits", async () => {
    const user = userEvent.setup();
    const focusArea = makeFocusArea({ id: 1, orgId: "org-1", name: "ICU" });
    const shiftCategories: ShiftCategory[] = [
      makeShiftCategory({
        id: 10,
        orgId: "org-1",
        name: "Days",
        focusAreaId: 1,
      }),
      makeShiftCategory({
        id: 11,
        orgId: "org-1",
        name: "Nights",
        focusAreaId: 1,
        sortOrder: 1,
      }),
    ];

    render(
      <ShiftCategoriesSettings
        shiftCategories={shiftCategories}
        focusAreas={[focusArea]}
        orgId="org-1"
        onChange={vi.fn()}
        canManageScheduleDefinitions
      />,
    );

    await user.click(screen.getAllByRole("button", { name: /^edit$/i })[0]);

    const nameInput = screen.getByDisplayValue("Days");
    expect(screen.getByRole("button", { name: /^close$/i })).toBeInTheDocument();

    await user.clear(nameInput);
    await user.type(nameInput, "Days Updated");

    expect(screen.getByRole("button", { name: /^discard$/i })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^edit$/i }));

    expect(await screen.findByRole("dialog", { name: /unsaved changes/i })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /keep editing/i }));

    expect(screen.queryByRole("dialog", { name: /unsaved changes/i })).not.toBeInTheDocument();
    expect(screen.getByDisplayValue("Days Updated")).toBeInTheDocument();
  });

  it("shift category editors save the selected color", async () => {
    const user = userEvent.setup();
    const focusArea = makeFocusArea({ id: 1, orgId: "org-1", name: "ICU" });
    const shiftCategory = makeShiftCategory({
      id: 10,
      orgId: "org-1",
      name: "Days",
      abbr: "D",
      focusAreaId: 1,
      color: "#E2E8F0",
    });

    vi.mocked(upsertShiftCategory).mockResolvedValue({
      ...shiftCategory,
      color: "#BFDBFE",
    });

    render(
      <ShiftCategoriesSettings
        shiftCategories={[shiftCategory]}
        focusAreas={[focusArea]}
        orgId="org-1"
        onChange={vi.fn()}
        canManageScheduleDefinitions
      />,
    );

    await user.click(screen.getByRole("button", { name: /^edit$/i }));
    await user.click(screen.getByRole("button", { name: /color preset:/i }));
    await user.click(await screen.findByRole("button", { name: /^blue$/i }));
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => {
      expect(upsertShiftCategory).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 10,
          color: "#BFDBFE",
        }),
      );
    });
  });

  it("uses a full-name shift preview without repeating its code in name mode", () => {
    const focusArea = makeFocusArea({ id: 1, orgId: "org-1", name: "ICU" });
    const shiftCategory = makeShiftCategory({
      id: 10,
      orgId: "org-1",
      name: "Day Shift",
      abbr: "D",
      focusAreaId: 1,
      color: "#E2E8F0",
    });

    render(
      <ShiftCategoriesSettings
        shiftCategories={[shiftCategory]}
        focusAreas={[focusArea]}
        orgId="org-1"
        onChange={vi.fn()}
        canManageScheduleDefinitions
        shiftDisplayMode="name"
      />,
    );

    expect(document.querySelector('[data-shift-category-preview="name"]')).toHaveTextContent(
      "Day Shift",
    );
    expect(screen.getAllByText("Day Shift")).toHaveLength(1);
    expect(screen.queryByText("D", { exact: true })).not.toBeInTheDocument();
  });

  it("hides the shift code editor in name mode", async () => {
    const user = userEvent.setup();
    const focusArea = makeFocusArea({ id: 1, orgId: "org-1", name: "ICU" });
    const shiftCategory = makeShiftCategory({
      id: 10,
      orgId: "org-1",
      name: "Day Shift",
      abbr: "D",
      focusAreaId: 1,
    });

    render(
      <ShiftCategoriesSettings
        shiftCategories={[shiftCategory]}
        focusAreas={[focusArea]}
        orgId="org-1"
        onChange={vi.fn()}
        canManageScheduleDefinitions
        shiftDisplayMode="name"
      />,
    );

    await user.click(screen.getByRole("button", { name: /^edit$/i }));

    expect(screen.queryByText(/^code$/i)).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue("D")).not.toBeInTheDocument();
  });

  it("shift category editors let admins customize the code abbreviation", async () => {
    const user = userEvent.setup();
    const focusArea = makeFocusArea({ id: 1, orgId: "org-1", name: "ICU" });
    const shiftCategory = makeShiftCategory({
      id: 10,
      orgId: "org-1",
      name: "Day Shift",
      abbr: "D",
      focusAreaId: 1,
      color: "#E2E8F0",
    });

    vi.mocked(upsertShiftCategory).mockResolvedValue({
      ...shiftCategory,
      abbr: "DAY",
    });

    render(
      <ShiftCategoriesSettings
        shiftCategories={[shiftCategory]}
        focusAreas={[focusArea]}
        orgId="org-1"
        onChange={vi.fn()}
        canManageScheduleDefinitions
      />,
    );

    await user.click(screen.getByRole("button", { name: /^edit$/i }));

    const codeInput = screen.getByDisplayValue("D");
    await user.clear(codeInput);
    await user.type(codeInput, "day");
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => {
      expect(upsertShiftCategory).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 10,
          abbr: "DAY",
        }),
      );
    });
  });

  it("Add Shift shows Cancel on a pristine new row, and Cancel removes the draft", async () => {
    const user = userEvent.setup();
    const focusArea = makeFocusArea({ id: 1, orgId: "org-1", name: "ICU" });

    render(
      <ShiftCategoriesSettings
        shiftCategories={[]}
        focusAreas={[focusArea]}
        orgId="org-1"
        onChange={vi.fn()}
        canManageScheduleDefinitions
      />,
    );

    await user.click(screen.getByRole("button", { name: /\+ add shift/i }));

    expect(screen.getByRole("button", { name: /^cancel$/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^discard$/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^cancel$/i }));

    expect(screen.queryByPlaceholderText("e.g. Day Shift")).not.toBeInTheDocument();
    expect(upsertShiftCategory).not.toHaveBeenCalled();
  });

  it("shift category editors auto-fill a code from the shift name before saving", async () => {
    const user = userEvent.setup();
    const focusArea = makeFocusArea({ id: 1, orgId: "org-1", name: "ICU" });

    vi.mocked(upsertShiftCategory).mockResolvedValue({
      id: 10,
      orgId: "org-1",
      name: "Day Shift",
      abbr: "D",
      startTime: null,
      endTime: null,
      color: "#E2E8F0",
      sortOrder: 0,
      focusAreaId: 1,
      breakMinutes: null,
      archivedAt: null,
    });

    render(
      <ShiftCategoriesSettings
        shiftCategories={[]}
        focusAreas={[focusArea]}
        orgId="org-1"
        onChange={vi.fn()}
        canManageScheduleDefinitions
      />,
    );

    await user.click(screen.getByRole("button", { name: /\+ add shift/i }));
    await user.type(screen.getByPlaceholderText("e.g. Day Shift"), "Day Shift");

    expect(screen.getByDisplayValue("D")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => {
      expect(upsertShiftCategory).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "Day Shift",
          abbr: "D",
        }),
      );
    });
  });

  it("disables schedule-code Save when the saved custom times only mirror the category", async () => {
    const user = userEvent.setup();
    const department = makeDepartment({
      id: 1,
      orgId: "org-1",
      name: "Nursing",
      type: "scheduled",
    });
    const focusArea = makeFocusArea({
      id: 1,
      orgId: "org-1",
      name: "North",
      departmentId: 1,
    });
    const shiftCategory = makeShiftCategory({
      id: 10,
      orgId: "org-1",
      name: "Day Shift",
      abbr: "D",
      focusAreaId: 1,
      sortOrder: 0,
    });
    const jobs: JobDefinition[] = [
      {
        id: 10,
        orgId: "org-1",
        name: "Supervisor",
        abbr: "SUP",
        showOnGrid: true,
        assignmentMode: "with_shift",
        focusAreaId: 1,
        focusAreaIds: [1],
        departmentIds: [1],
        applicableShiftIds: [10],
        eligibleRoleIds: [],
        requiredCertificationIds: [],
        color: "#E2E8F0",
        border: "#CBD5E1",
        text: "#1E293B",
        defaultStartTime: null,
        defaultEndTime: null,
        defaultDurationHours: null,
        defaultDurationMinutes: null,
        sortOrder: 0,
        systemKey: null,
        archivedAt: null,
      },
    ];

    render(
      <JobsSettings
        jobs={jobs}
        orgId="org-1"
        orgRoles={[]}
        certifications={[]}
        departments={[department]}
        focusAreas={[focusArea]}
        shiftCategories={[shiftCategory]}
        roleLabel="Roles"
        certificationLabel="Certifications"
        onChange={vi.fn()}
        canManageScheduleDefinitions
      />,
    );

    await user.click(screen.getByText("Supervisor"));

    const saveButton = screen.getByRole("button", { name: /^save$/i });
    expect(saveButton).toBeDisabled();

    const nameInput = screen.getByDisplayValue("Supervisor");
    await user.clear(nameInput);
    await user.type(nameInput, "Supervisor Updated");
    expect(saveButton).toBeEnabled();

    await user.clear(nameInput);
    await user.type(nameInput, "Supervisor");
    expect(saveButton).toBeDisabled();
  });

  it("job editors swap Close for Discard and prompt before collapsing dirty edits", async () => {
    const user = userEvent.setup();
    const jobs: JobDefinition[] = [
      {
        id: 10,
        orgId: "org-1",
        name: "Mentor",
        abbr: "MEN",
        showOnGrid: true,
        assignmentMode: "with_shift",
        eligibleRoleIds: [],
        requiredCertificationIds: [],
        color: "#E2E8F0",
        border: "#CBD5E1",
        text: "#1E293B",
        defaultStartTime: null,
        defaultEndTime: null,
        defaultDurationHours: null,
        defaultDurationMinutes: null,
        sortOrder: 0,
        systemKey: null,
        archivedAt: null,
      },
    ];

    render(
      <JobsSettings
        jobs={jobs}
        orgId="org-1"
        orgRoles={[]}
        certifications={[]}
        roleLabel="Roles"
        certificationLabel="Certifications"
        onChange={vi.fn()}
        canManageScheduleDefinitions
      />,
    );

    await user.click(screen.getByText("Mentor"));

    expect(screen.getByRole("button", { name: /^close$/i })).toBeInTheDocument();

    const nameInput = screen.getByDisplayValue("Mentor");
    await user.clear(nameInput);
    await user.type(nameInput, "Mentor Updated");

    expect(screen.getByRole("button", { name: /^discard$/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^close$/i })).not.toBeInTheDocument();

    await user.click(screen.getByText("Mentor Updated"));

    expect(await screen.findByRole("dialog", { name: /unsaved changes/i })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /keep editing/i }));

    expect(screen.queryByRole("dialog", { name: /unsaved changes/i })).not.toBeInTheDocument();
    expect(screen.getByDisplayValue("Mentor Updated")).toBeInTheDocument();
  });

  it("Add Scheduled Job shows Cancel, and Cancel removes the unsaved draft without calling the API", async () => {
    const user = userEvent.setup();
    const department = makeDepartment({
      id: 1,
      orgId: "org-1",
      name: "Nursing",
      type: "scheduled",
    });
    const focusArea = makeFocusArea({
      id: 1,
      orgId: "org-1",
      name: "North",
      departmentId: 1,
    });
    const shiftCategory = makeShiftCategory({
      id: 10,
      orgId: "org-1",
      name: "Day Shift",
      abbr: "D",
      focusAreaId: 1,
      sortOrder: 0,
    });

    render(
      <JobsSettings
        jobs={[]}
        orgId="org-1"
        orgRoles={[]}
        certifications={[]}
        departments={[department]}
        focusAreas={[focusArea]}
        shiftCategories={[shiftCategory]}
        roleLabel="Roles"
        certificationLabel="Certifications"
        onChange={vi.fn()}
        canManageScheduleDefinitions
      />,
    );

    await user.click(screen.getByRole("button", { name: /add scheduled job/i }));

    // Pristine new draft must offer Cancel, not Discard or Close.
    expect(screen.getByRole("button", { name: /^cancel$/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^discard$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^close$/i })).not.toBeInTheDocument();

    // Type something so the draft is "dirty" — Cancel must still be shown.
    await user.type(screen.getByPlaceholderText("e.g. Supervisor"), "Supervisor");
    expect(screen.getByRole("button", { name: /^cancel$/i })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^cancel$/i }));

    // Editor closes, no draft row remains, and no save fired.
    expect(screen.queryByPlaceholderText("e.g. Supervisor")).not.toBeInTheDocument();
    expect(upsertJobDefinition).not.toHaveBeenCalled();
  });

  it("hides job abbreviations in name mode", async () => {
    const user = userEvent.setup();
    const department = makeDepartment({
      id: 1,
      orgId: "org-1",
      name: "Nursing",
      type: "scheduled",
    });
    const focusArea = makeFocusArea({ id: 1, orgId: "org-1", name: "North", departmentId: 1 });
    const shiftCategory = makeShiftCategory({
      id: 10,
      orgId: "org-1",
      name: "Day Shift",
      abbr: "D",
      focusAreaId: 1,
    });

    render(
      <JobsSettings
        jobs={[]}
        orgId="org-1"
        orgRoles={[]}
        certifications={[]}
        departments={[department]}
        focusAreas={[focusArea]}
        shiftCategories={[shiftCategory]}
        roleLabel="Roles"
        certificationLabel="Certifications"
        onChange={vi.fn()}
        canManageScheduleDefinitions
        organization={{ ...baseOrganization, shiftDisplayMode: "name" }}
      />,
    );

    await user.click(screen.getByRole("button", { name: /add scheduled job/i }));

    expect(screen.queryByText("GRID ABBR")).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText("e.g. SUP")).not.toBeInTheDocument();
  });

  it("general jobs clear legacy duration values when fixed times are already set", async () => {
    const user = userEvent.setup();
    const jobs: JobDefinition[] = [
      {
        id: 12,
        orgId: "org-1",
        name: "Office",
        abbr: "OFC",
        showOnGrid: true,
        assignmentMode: "shiftless",
        eligibleRoleIds: [],
        requiredCertificationIds: [],
        color: "#E2E8F0",
        border: "#CBD5E1",
        text: "#1E293B",
        defaultStartTime: "08:00",
        defaultEndTime: "12:00",
        defaultDurationHours: 4,
        defaultDurationMinutes: 0,
        sortOrder: 0,
        systemKey: null,
        archivedAt: null,
      },
    ];

    vi.mocked(upsertJobDefinition).mockResolvedValue({
      ...jobs[0]!,
      name: "Office Support",
      defaultDurationHours: null,
      defaultDurationMinutes: null,
    });

    render(
      <JobsSettings
        jobs={jobs}
        orgId="org-1"
        orgRoles={[]}
        certifications={[]}
        roleLabel="Roles"
        certificationLabel="Certifications"
        onChange={vi.fn()}
        canManageScheduleDefinitions
      />,
    );

    await user.click(screen.getByText("Office"));
    await user.type(screen.getByDisplayValue("Office"), " Support");
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => {
      expect(upsertJobDefinition).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "Office Support",
          defaultStartTime: "08:00",
          defaultEndTime: "12:00",
          defaultDurationHours: null,
          defaultDurationMinutes: null,
        }),
      );
    });
  });

  it("general jobs require a complete fixed time or a duration before saving", async () => {
    const user = userEvent.setup();
    const jobs: JobDefinition[] = [
      {
        id: 12,
        orgId: "org-1",
        name: "Office",
        abbr: "OFC",
        showOnGrid: true,
        assignmentMode: "shiftless",
        eligibleRoleIds: [],
        requiredCertificationIds: [],
        color: "#E2E8F0",
        border: "#CBD5E1",
        text: "#1E293B",
        defaultStartTime: "08:00",
        defaultEndTime: null,
        defaultDurationHours: null,
        defaultDurationMinutes: null,
        sortOrder: 0,
        systemKey: null,
        archivedAt: null,
      },
    ];

    vi.mocked(upsertJobDefinition).mockResolvedValue({
      ...jobs[0]!,
      name: "Office Support",
      defaultStartTime: null,
      defaultEndTime: null,
      defaultDurationHours: 8,
      defaultDurationMinutes: 0,
    });

    render(
      <JobsSettings
        jobs={jobs}
        orgId="org-1"
        orgRoles={[]}
        certifications={[]}
        roleLabel="Roles"
        certificationLabel="Certifications"
        onChange={vi.fn()}
        canManageScheduleDefinitions
      />,
    );

    await user.click(screen.getByText("Office"));
    await user.type(screen.getByDisplayValue("Office"), " Support");

    const saveButton = screen.getByRole("button", { name: /^save$/i });
    expect(saveButton).toBeDisabled();
    expect(
      screen.getByText(
        /enter both a start and end time, or switch this general job to duration mode/i,
      ),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /use duration instead/i }));

    const [hoursInput] = screen.getAllByRole("spinbutton");
    await user.clear(hoursInput!);
    await user.type(hoursInput!, "8");

    expect(saveButton).toBeEnabled();

    await user.click(saveButton);

    await waitFor(() => {
      expect(upsertJobDefinition).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "Office Support",
          defaultStartTime: null,
          defaultEndTime: null,
          defaultDurationHours: 8,
          defaultDurationMinutes: 0,
        }),
      );
    });
  });

  it("sorts saved jobs by qualification seniority while keeping unsaved drafts at the end", async () => {
    const user = userEvent.setup();
    const department = makeDepartment({
      id: 1,
      orgId: "org-1",
      name: "Nursing",
      type: "scheduled",
    });
    const focusArea = makeFocusArea({
      id: 1,
      orgId: "org-1",
      name: "North",
      departmentId: 1,
    });
    const shiftCategory = makeShiftCategory({
      id: 10,
      orgId: "org-1",
      name: "Day Shift",
      abbr: "D",
      focusAreaId: 1,
      sortOrder: 0,
    });
    const roles: NamedItem[] = [
      {
        id: 7,
        orgId: "org-1",
        name: "Supervisor",
        abbr: "SUP",
        isScheduleRole: true,
        sortOrder: 0,
        departmentIds: [],
      },
      {
        id: 9,
        orgId: "org-1",
        name: "Mentor",
        abbr: "MEN",
        isScheduleRole: true,
        sortOrder: 2,
        departmentIds: [],
      },
    ];
    const certifications: NamedItem[] = [
      {
        id: 1,
        orgId: "org-1",
        name: "CN III",
        abbr: "CN3",
        sortOrder: 0,
        departmentIds: [],
      },
    ];
    const jobs: JobDefinition[] = [
      {
        id: 10,
        orgId: "org-1",
        name: "Mentor",
        abbr: "MEN",
        showOnGrid: true,
        assignmentMode: "with_shift",
        focusAreaId: 1,
        focusAreaIds: [1],
        departmentIds: [1],
        applicableShiftIds: [10],
        eligibleRoleIds: [9],
        requiredCertificationIds: [],
        color: "#E2E8F0",
        border: "#CBD5E1",
        text: "#1E293B",
        defaultStartTime: null,
        defaultEndTime: null,
        defaultDurationHours: null,
        defaultDurationMinutes: null,
        sortOrder: 0,
        systemKey: null,
        archivedAt: null,
      },
      {
        id: 11,
        orgId: "org-1",
        name: "Supervisor",
        abbr: "SUP",
        showOnGrid: true,
        assignmentMode: "with_shift",
        focusAreaId: 1,
        focusAreaIds: [1],
        departmentIds: [1],
        applicableShiftIds: [10],
        eligibleRoleIds: [7],
        requiredCertificationIds: [],
        color: "#E2E8F0",
        border: "#CBD5E1",
        text: "#1E293B",
        defaultStartTime: null,
        defaultEndTime: null,
        defaultDurationHours: null,
        defaultDurationMinutes: null,
        sortOrder: 1,
        systemKey: null,
        archivedAt: null,
      },
      {
        id: 12,
        orgId: "org-1",
        name: "Office",
        abbr: "OFC",
        showOnGrid: true,
        assignmentMode: "shiftless",
        eligibleRoleIds: [],
        requiredCertificationIds: [],
        color: "#E2E8F0",
        border: "#CBD5E1",
        text: "#1E293B",
        defaultStartTime: null,
        defaultEndTime: null,
        defaultDurationHours: null,
        defaultDurationMinutes: null,
        sortOrder: 0,
        systemKey: null,
        archivedAt: null,
      },
      {
        id: 13,
        orgId: "org-1",
        name: "Charge Nurse",
        abbr: "CN",
        showOnGrid: true,
        assignmentMode: "shiftless",
        eligibleRoleIds: [],
        requiredCertificationIds: [1],
        color: "#E2E8F0",
        border: "#CBD5E1",
        text: "#1E293B",
        defaultStartTime: null,
        defaultEndTime: null,
        defaultDurationHours: null,
        defaultDurationMinutes: null,
        sortOrder: 1,
        systemKey: null,
        archivedAt: null,
      },
    ];

    render(
      <JobsSettings
        jobs={jobs}
        orgId="org-1"
        orgRoles={roles}
        certifications={certifications}
        departments={[department]}
        focusAreas={[focusArea]}
        shiftCategories={[shiftCategory]}
        roleLabel="Roles"
        certificationLabel="Certifications"
        onChange={vi.fn()}
        canManageScheduleDefinitions
      />,
    );

    const supervisorRow = screen.getByText("Supervisor");
    const mentorRow = screen.getByText("Mentor");
    const chargeNurseRow = screen.getByText("Charge Nurse");
    const officeRow = screen.getByText("Office");

    expect(
      supervisorRow.compareDocumentPosition(mentorRow) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      mentorRow.compareDocumentPosition(chargeNurseRow) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      chargeNurseRow.compareDocumentPosition(officeRow) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    await user.click(screen.getByRole("button", { name: /add scheduled job/i }));
    await user.type(screen.getByPlaceholderText("e.g. Supervisor"), "Draft Lead");
    await user.type(screen.getByPlaceholderText("e.g. SUP"), "DRF");

    const draftRow = screen.getAllByText("Draft Lead")[0]!;
    expect(
      mentorRow.compareDocumentPosition(draftRow) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  // A new scheduled job starts with no placement; the scheduler picks the
  // department, its focus areas and the shifts in that order.
  async function pickPlacement(
    user: ReturnType<typeof userEvent.setup>,
    labels: { departments: RegExp[]; focusAreas: RegExp[]; shifts: RegExp[] },
  ) {
    for (const label of labels.departments) await user.click(screen.getByLabelText(label));
    for (const label of labels.focusAreas) await user.click(screen.getByLabelText(label));
    for (const label of labels.shifts) await user.click(screen.getByLabelText(label));
  }

  it("starts a new scheduled job with nothing placed and only requires picks when narrowed to specific shifts", async () => {
    const user = userEvent.setup();
    const department = makeDepartment({
      id: 1,
      orgId: "org-1",
      name: "Nursing",
      type: "scheduled",
    });
    const focusArea = makeFocusArea({
      id: 1,
      orgId: "org-1",
      name: "North",
      departmentId: 1,
    });
    const shiftCategory = makeShiftCategory({
      id: 10,
      orgId: "org-1",
      name: "Day Shift",
      abbr: "D",
      focusAreaId: 1,
      sortOrder: 0,
    });

    render(
      <JobsSettings
        jobs={[]}
        orgId="org-1"
        orgRoles={[]}
        certifications={[]}
        departments={[department]}
        focusAreas={[focusArea]}
        shiftCategories={[shiftCategory]}
        roleLabel="Roles"
        certificationLabel="Certifications"
        onChange={vi.fn()}
        canManageScheduleDefinitions
      />,
    );

    await user.click(screen.getByRole("button", { name: /add scheduled job/i }));

    const saveButton = screen.getByRole("button", { name: /^save$/i });
    expect(saveButton).toBeDisabled();
    expect(screen.getByLabelText(/^Nursing$/i)).not.toBeChecked();
    expect(screen.queryByLabelText(/^North$/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^Day Shift$/i)).not.toBeInTheDocument();

    await pickPlacement(user, {
      departments: [/^Nursing$/i],
      focusAreas: [/^North$/i],
      shifts: [/^Day Shift$/i],
    });
    expect(screen.getByLabelText(/^Nursing$/i)).toBeChecked();
    expect(screen.getByLabelText(/^North$/i)).toBeChecked();
    expect(screen.getByLabelText(/^Day Shift$/i)).toBeChecked();

    await user.type(screen.getByPlaceholderText("e.g. Supervisor"), "Supervisor");
    await user.type(screen.getByPlaceholderText("e.g. SUP"), "SUP");

    expect(saveButton).toBeEnabled();

    await user.click(screen.getByLabelText(/^North$/i));
    expect(saveButton).toBeDisabled();

    await user.click(screen.getByLabelText(/^North$/i));
    expect(saveButton).toBeDisabled();

    await user.click(screen.getByLabelText(/^Day Shift$/i));
    expect(saveButton).toBeEnabled();
  });

  it("scheduled jobs only show focus areas from the selected scheduled departments and can narrow into them", async () => {
    const user = userEvent.setup();
    const departments: Department[] = [
      makeDepartment({
        id: 1,
        orgId: "org-1",
        name: "Nursing",
        type: "scheduled",
      }),
      makeDepartment({
        id: 2,
        orgId: "org-1",
        name: "Specialty",
        type: "scheduled",
        sortOrder: 1,
      }),
    ];
    const focusAreas = [
      makeFocusArea({ id: 1, orgId: "org-1", name: "North", departmentId: 1 }),
      makeFocusArea({
        id: 2,
        orgId: "org-1",
        name: "South",
        departmentId: 1,
        sortOrder: 1,
      }),
      makeFocusArea({
        id: 3,
        orgId: "org-1",
        name: "East",
        departmentId: 2,
        sortOrder: 2,
      }),
    ];
    const shiftCategories = [
      makeShiftCategory({
        id: 10,
        orgId: "org-1",
        name: "Day Shift",
        abbr: "D",
        focusAreaId: 1,
      }),
      makeShiftCategory({
        id: 11,
        orgId: "org-1",
        name: "Night Shift",
        abbr: "N",
        focusAreaId: 2,
        sortOrder: 1,
      }),
      makeShiftCategory({
        id: 12,
        orgId: "org-1",
        name: "Evening Shift",
        abbr: "E",
        focusAreaId: 3,
        sortOrder: 2,
      }),
    ];

    render(
      <JobsSettings
        jobs={[]}
        orgId="org-1"
        orgRoles={[]}
        certifications={[]}
        departments={departments}
        focusAreas={focusAreas}
        shiftCategories={shiftCategories}
        roleLabel="Roles"
        certificationLabel="Certifications"
        onChange={vi.fn()}
        canManageScheduleDefinitions
      />,
    );

    await user.click(screen.getByRole("button", { name: /add scheduled job/i }));
    await user.type(screen.getByPlaceholderText("e.g. Supervisor"), "Supervisor");
    await user.type(screen.getByPlaceholderText("e.g. SUP"), "SUP");
    await pickPlacement(user, {
      departments: [/^Nursing$/i],
      focusAreas: [/^North$/i, /^South$/i],
      shifts: [/^Day Shift$/i, /^Night Shift$/i],
    });

    const saveButton = screen.getByRole("button", { name: /^save$/i });
    expect(saveButton).toBeEnabled();
    expect(screen.getByLabelText(/^North$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^South$/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/^East$/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/^Day Shift$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Night Shift$/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/^Evening Shift$/i)).not.toBeInTheDocument();

    await user.click(screen.getByLabelText(/^South$/i));
    expect(saveButton).toBeEnabled();
    expect(screen.queryByLabelText(/^Night Shift$/i)).not.toBeInTheDocument();

    await user.click(screen.getByLabelText(/^Specialty$/i));
    expect(screen.getByLabelText(/^East$/i)).toBeInTheDocument();

    await user.click(screen.getByLabelText(/^East$/i));
    expect(screen.queryByText("South · Night Shift")).not.toBeInTheDocument();
    expect(screen.queryByText("East · Evening Shift")).not.toBeInTheDocument();

    await user.click(screen.getByLabelText(/^Evening Shift$/i));
    expect(screen.getByLabelText(/^Evening Shift$/i)).toBeChecked();
    expect(screen.getByText("2 shifts selected")).toBeInTheDocument();
  });

  it("select all only changes the current placement container and leaves downstream picks explicit", async () => {
    const user = userEvent.setup();
    const departments: Department[] = [
      makeDepartment({
        id: 1,
        orgId: "org-1",
        name: "Nursing",
        type: "scheduled",
      }),
      makeDepartment({
        id: 2,
        orgId: "org-1",
        name: "Specialty",
        type: "scheduled",
        sortOrder: 1,
      }),
    ];
    const focusAreas = [
      makeFocusArea({ id: 1, orgId: "org-1", name: "North", departmentId: 1 }),
      makeFocusArea({
        id: 2,
        orgId: "org-1",
        name: "South",
        departmentId: 1,
        sortOrder: 1,
      }),
      makeFocusArea({
        id: 3,
        orgId: "org-1",
        name: "East",
        departmentId: 2,
        sortOrder: 2,
      }),
    ];
    const shiftCategories = [
      makeShiftCategory({
        id: 10,
        orgId: "org-1",
        name: "Day Shift",
        abbr: "D",
        focusAreaId: 1,
      }),
      makeShiftCategory({
        id: 11,
        orgId: "org-1",
        name: "Night Shift",
        abbr: "N",
        focusAreaId: 2,
        sortOrder: 1,
      }),
      makeShiftCategory({
        id: 12,
        orgId: "org-1",
        name: "Evening Shift",
        abbr: "E",
        focusAreaId: 3,
        sortOrder: 2,
      }),
    ];

    render(
      <JobsSettings
        jobs={[]}
        orgId="org-1"
        orgRoles={[]}
        certifications={[]}
        departments={departments}
        focusAreas={focusAreas}
        shiftCategories={shiftCategories}
        roleLabel="Roles"
        certificationLabel="Certifications"
        onChange={vi.fn()}
        canManageScheduleDefinitions
      />,
    );

    await user.click(screen.getByRole("button", { name: /add scheduled job/i }));
    await user.type(screen.getByPlaceholderText("e.g. Supervisor"), "Supervisor");
    await user.type(screen.getByPlaceholderText("e.g. SUP"), "SUP");
    await pickPlacement(user, {
      departments: [/^Nursing$/i],
      focusAreas: [/^North$/i, /^South$/i],
      shifts: [/^Day Shift$/i, /^Night Shift$/i],
    });

    const [departmentSelectAll, focusAreaSelectAll, shiftSelectAll] =
      screen.getAllByLabelText(/^select all$/i);

    await user.click(departmentSelectAll!);
    expect(screen.getByLabelText(/^East$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^East$/i)).not.toBeChecked();
    expect(screen.queryByLabelText(/^Evening Shift$/i)).not.toBeInTheDocument();

    await user.click(focusAreaSelectAll!);
    expect(screen.getByLabelText(/^East$/i)).toBeChecked();
    expect(screen.getByLabelText(/^Evening Shift$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Evening Shift$/i)).not.toBeChecked();

    await user.click(shiftSelectAll!);
    expect(screen.getByLabelText(/^Evening Shift$/i)).toBeChecked();
  });

  it("scheduled jobs inherit shift times by default and can switch into override mode", async () => {
    const user = userEvent.setup();
    const department = makeDepartment({
      id: 1,
      orgId: "org-1",
      name: "Nursing",
      type: "scheduled",
    });
    const focusArea = makeFocusArea({
      id: 1,
      orgId: "org-1",
      name: "North",
      departmentId: 1,
    });
    const shiftCategory = makeShiftCategory({
      id: 10,
      orgId: "org-1",
      name: "Day Shift",
      abbr: "D",
      focusAreaId: 1,
      sortOrder: 0,
      startTime: "07:00",
      endTime: "15:00",
    });

    render(
      <JobsSettings
        jobs={[]}
        orgId="org-1"
        orgRoles={[]}
        certifications={[]}
        departments={[department]}
        focusAreas={[focusArea]}
        shiftCategories={[shiftCategory]}
        roleLabel="Roles"
        certificationLabel="Certifications"
        onChange={vi.fn()}
        canManageScheduleDefinitions
      />,
    );

    await user.click(screen.getByRole("button", { name: /add scheduled job/i }));
    await user.type(screen.getByPlaceholderText("e.g. Supervisor"), "Supervisor");
    await user.type(screen.getByPlaceholderText("e.g. SUP"), "SUP");
    await pickPlacement(user, {
      departments: [/^Nursing$/i],
      focusAreas: [/^North$/i],
      shifts: [/^Day Shift/i],
    });

    expect(screen.getByText(/using 07:00-15:00 from the shift/i)).toBeInTheDocument();

    await user.click(screen.getByLabelText(/override time/i));

    expect(screen.getByText("Start")).toBeInTheDocument();
    expect(screen.getByText("End")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^save$/i })).toBeEnabled();
  });

  it("scheduled job previews always spell out the full shift and job name", async () => {
    const user = userEvent.setup();
    const department = makeDepartment({
      id: 1,
      orgId: "org-1",
      name: "Nursing",
      type: "scheduled",
    });
    const focusArea = makeFocusArea({
      id: 1,
      orgId: "org-1",
      name: "North",
      departmentId: 1,
    });
    const shiftCategory = makeShiftCategory({
      id: 10,
      orgId: "org-1",
      name: "Day Shift",
      abbr: "D",
      focusAreaId: 1,
      sortOrder: 0,
      startTime: "07:00",
      endTime: "15:00",
    });
    const job: JobDefinition = {
      id: 22,
      orgId: "org-1",
      name: "Supervisor",
      abbr: "SUP",
      showOnGrid: true,
      assignmentMode: "with_shift",
      focusAreaId: 1,
      focusAreaIds: [1],
      departmentIds: [1],
      applicableShiftIds: [10],
      eligibleRoleIds: [],
      requiredCertificationIds: [],
      color: "#E2E8F0",
      border: "#CBD5E1",
      text: "#475569",
      shiftTimeOverrides: {},
      shiftColorOverrides: {},
      defaultStartTime: null,
      defaultEndTime: null,
      defaultDurationHours: null,
      defaultDurationMinutes: null,
      sortOrder: 0,
      systemKey: null,
      archivedAt: null,
    };

    render(
      <JobsSettings
        jobs={[job]}
        orgId="org-1"
        orgRoles={[]}
        certifications={[]}
        departments={[department]}
        focusAreas={[focusArea]}
        shiftCategories={[shiftCategory]}
        roleLabel="Roles"
        certificationLabel="Certifications"
        onChange={vi.fn()}
        canManageScheduleDefinitions
      />,
    );

    await user.click(screen.getByText(/1 department.*1 focus area.*1 shift/i));

    const namePreview = document.querySelector<HTMLElement>('[data-job-shift-preview="10"]');
    expect(namePreview).not.toBeNull();
    expect(within(namePreview!).getByText(/^Day Shift$/)).toBeInTheDocument();
    expect(within(namePreview!).getByText(/^Supervisor$/)).toBeInTheDocument();
    expect(within(namePreview!).queryByText(/^D$/)).not.toBeInTheDocument();
    expect(within(namePreview!).queryByText(/^SUP$/)).not.toBeInTheDocument();
  });

  it("default shift job previews only show the shift's full name", async () => {
    const user = userEvent.setup();
    const department = makeDepartment({
      id: 1,
      orgId: "org-1",
      name: "Nursing",
      type: "scheduled",
    });
    const focusArea = makeFocusArea({
      id: 1,
      orgId: "org-1",
      name: "North",
      departmentId: 1,
    });
    const shiftCategory = makeShiftCategory({
      id: 10,
      orgId: "org-1",
      name: "Day Shift",
      abbr: "D",
      focusAreaId: 1,
      sortOrder: 0,
      startTime: "07:00",
      endTime: "15:00",
    });
    const defaultShiftJob: JobDefinition = {
      id: 22,
      orgId: "org-1",
      name: "Default shift job",
      abbr: "SHIFT",
      showOnGrid: false,
      assignmentMode: "with_shift",
      focusAreaId: 1,
      focusAreaIds: [1],
      departmentIds: [1],
      applicableShiftIds: [10],
      eligibleRoleIds: [],
      requiredCertificationIds: [],
      color: "#E2E8F0",
      border: "#CBD5E1",
      text: "#475569",
      shiftTimeOverrides: {},
      shiftColorOverrides: {},
      defaultStartTime: null,
      defaultEndTime: null,
      defaultDurationHours: null,
      defaultDurationMinutes: null,
      sortOrder: -1000,
      systemKey: DEFAULT_SHIFT_JOB_SYSTEM_KEY,
      archivedAt: null,
    };

    render(
      <JobsSettings
        jobs={[defaultShiftJob]}
        orgId="org-1"
        orgRoles={[]}
        certifications={[]}
        departments={[department]}
        focusAreas={[focusArea]}
        shiftCategories={[shiftCategory]}
        roleLabel="Roles"
        certificationLabel="Certifications"
        onChange={vi.fn()}
        canManageScheduleDefinitions
      />,
    );

    expect(screen.queryByText("Default Shift Job")).not.toBeInTheDocument();
    await user.click(screen.getByText("Default shift job"));

    const namePreview = document.querySelector<HTMLElement>('[data-job-shift-preview="10"]');
    expect(namePreview).not.toBeNull();
    expect(within(namePreview!).getByText(/^Day Shift$/)).toBeInTheDocument();
    expect(within(namePreview!).queryByText(/^SHIFT$/)).not.toBeInTheDocument();
    expect(within(namePreview!).queryByText(/^Default shift job$/)).not.toBeInTheDocument();
    expect(within(namePreview!).queryByText(/^D$/)).not.toBeInTheDocument();
  });

  it("scheduled jobs can override one shift while still applying to all matching shifts", async () => {
    const user = userEvent.setup();
    const department = makeDepartment({
      id: 1,
      orgId: "org-1",
      name: "Nursing",
      type: "scheduled",
    });
    const focusArea = makeFocusArea({
      id: 1,
      orgId: "org-1",
      name: "North",
      departmentId: 1,
    });
    const shiftCategories = [
      makeShiftCategory({
        id: 10,
        orgId: "org-1",
        name: "Day Shift",
        abbr: "D",
        focusAreaId: 1,
        sortOrder: 0,
        startTime: "07:00",
        endTime: "15:00",
      }),
      makeShiftCategory({
        id: 11,
        orgId: "org-1",
        name: "Night Shift",
        abbr: "N",
        focusAreaId: 1,
        sortOrder: 1,
        startTime: "23:00",
        endTime: "07:00",
      }),
    ];

    vi.mocked(upsertJobDefinition).mockResolvedValue({
      id: 100,
      orgId: "org-1",
      name: "Supervisor",
      abbr: "SUP",
      showOnGrid: true,
      assignmentMode: "with_shift",
      focusAreaId: 1,
      focusAreaIds: [1],
      departmentIds: [],
      applicableShiftIds: [],
      eligibleRoleIds: [],
      requiredCertificationIds: [],
      color: "",
      border: "",
      text: "",
      shiftTimeOverrides: {
        "11": {
          startTime: "23:00",
          endTime: "07:00",
        },
      },
      shiftColorOverrides: {
        "11": "#BFDBFE",
      },
      defaultStartTime: null,
      defaultEndTime: null,
      defaultDurationHours: null,
      defaultDurationMinutes: null,
      sortOrder: 0,
      systemKey: null,
      archivedAt: null,
    });

    render(
      <JobsSettings
        jobs={[]}
        orgId="org-1"
        orgRoles={[]}
        certifications={[]}
        departments={[department]}
        focusAreas={[focusArea]}
        shiftCategories={shiftCategories}
        roleLabel="Roles"
        certificationLabel="Certifications"
        onChange={vi.fn()}
        canManageScheduleDefinitions
      />,
    );

    await user.click(screen.getByRole("button", { name: /add scheduled job/i }));
    await user.type(screen.getByPlaceholderText("e.g. Supervisor"), "Supervisor");
    await user.type(screen.getByPlaceholderText("e.g. SUP"), "SUP");
    await pickPlacement(user, {
      departments: [/^Nursing$/i],
      focusAreas: [/^North$/i],
      shifts: [/^Day Shift/i, /^Night Shift/i],
    });

    await user.click(screen.getAllByLabelText(/override time/i)[1]!);
    await user.click(screen.getAllByRole("button", { name: /color preset:/i })[1]!);
    await user.click(await screen.findByRole("button", { name: /^slate$/i }));
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => {
      expect(upsertJobDefinition).toHaveBeenCalledWith(
        expect.objectContaining({
          color: "",
          border: "",
          text: "",
          shiftTimeOverrides: {
            "11": {
              startTime: "23:00",
              endTime: "07:00",
            },
          },
          shiftColorOverrides: {
            "11": "#E2E8F0",
          },
        }),
      );
    });
  });

  it("Add Absence Type shows Cancel on a pristine new row, and Cancel removes the draft", async () => {
    const user = userEvent.setup();

    render(
      <AbsenceTypesSettings
        absenceTypes={[]}
        orgId="org-1"
        onChange={vi.fn()}
        canManageScheduleDefinitions
        shiftDisplayMode="code"
      />,
    );

    await user.click(screen.getByRole("button", { name: /\+ add absence type/i }));

    expect(screen.getByRole("button", { name: /^cancel$/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^discard$/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^cancel$/i }));

    expect(screen.queryByPlaceholderText("e.g. Vacation")).not.toBeInTheDocument();
  });

  it("absence type editors disable Save until there is a real persisted-value change", async () => {
    const user = userEvent.setup();
    const absenceTypes: AbsenceType[] = [
      {
        id: 2,
        orgId: "org-1",
        label: "VAC",
        name: "Vacation",
        color: "#E2E8F0",
        border: "transparent",
        text: "#1E293B",
        sortOrder: 0,
        archivedAt: null,
      },
    ];

    render(
      <AbsenceTypesSettings
        absenceTypes={absenceTypes}
        orgId="org-1"
        onChange={vi.fn()}
        canManageScheduleDefinitions
        shiftDisplayMode="code"
      />,
    );

    await user.click(screen.getByText("Vacation"));

    const saveButton = screen.getByRole("button", { name: /^save$/i });
    expect(saveButton).toBeDisabled();

    const nameInput = screen.getByDisplayValue("Vacation");
    await user.type(nameInput, "   ");
    expect(saveButton).toBeDisabled();

    await user.clear(nameInput);
    await user.type(nameInput, "Vacation Leave");
    expect(saveButton).toBeEnabled();
  });

  it("custom labels block invalid text before save", async () => {
    const user = userEvent.setup();

    render(<OrganizationLabels organization={baseOrganization} onSave={vi.fn()} />);

    const input = screen.getByDisplayValue("Focus Areas");
    await user.clear(input);
    await user.type(input, "https://units.example");

    expect(screen.getByText("Focus area label cannot contain a URL")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^save$/i })).toBeDisabled();
    expect(updateOrganizationSettings).not.toHaveBeenCalled();
  });

  it("string list settings block invalid names before save", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);

    render(
      <StringListSettings
        label="Roles"
        items={[{ id: 1, orgId: "org-1", name: "Charge Nurse", abbr: "CN", sortOrder: 0 }]}
        onSave={onSave}
        placeholder="Role"
        initialEditing
      />,
    );

    const input = screen.getByDisplayValue("Charge Nurse");
    await user.clear(input);
    await user.type(input, "https://bad.example");

    expect(screen.getByText("Name cannot contain a URL")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^save$/i })).toBeDisabled();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("department settings block invalid department names before save", async () => {
    const user = userEvent.setup();

    render(
      <DepartmentsSettings
        departments={[
          {
            id: 1,
            orgId: "org-1",
            name: "North",
            abbr: "North",
            type: "scheduled",
            sortOrder: 0,
            archivedAt: null,
          },
        ]}
        focusAreas={[]}
        orgId="org-1"
        focusAreaLabel="Focus Areas"
        departmentLabel="Departments"
        canManageFocusAreas
        onDepartmentsChange={vi.fn()}
        onFocusAreasChange={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: /^edit$/i }));
    const input = screen.getByDisplayValue("North");
    await user.clear(input);
    await user.type(input, "www.bad.example");

    expect(screen.getByText("Department name cannot contain a URL")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^save$/i })).toBeDisabled();
    expect(saveDepartments).not.toHaveBeenCalled();
  });

  it("indicator settings block invalid names before save", async () => {
    const user = userEvent.setup();
    const indicator: IndicatorType = {
      id: 1,
      orgId: "org-1",
      name: "Readings",
      color: "#ff0000",
      sortOrder: 0,
    };

    render(
      <Indicators
        indicatorTypes={[indicator]}
        orgId="org-1"
        onChange={vi.fn()}
        canManageIndicatorTypes
      />,
    );

    await user.click(screen.getByText("Readings"));
    const input = screen.getByDisplayValue("Readings");
    await user.clear(input);
    await user.type(input, "https://bad.example");

    expect(screen.getByText("Indicator name cannot contain a URL")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^save$/i })).toBeDisabled();
    expect(upsertIndicatorType).not.toHaveBeenCalled();
  });

  it("shift category settings block invalid names before save", async () => {
    const user = userEvent.setup();
    const focusArea = makeFocusArea({ id: 1, orgId: "org-1", name: "ICU" });
    const shiftCategory = makeShiftCategory({
      id: 10,
      orgId: "org-1",
      name: "Days",
      abbr: "D",
      focusAreaId: 1,
    });

    render(
      <ShiftCategoriesSettings
        shiftCategories={[shiftCategory]}
        focusAreas={[focusArea]}
        orgId="org-1"
        onChange={vi.fn()}
        canManageScheduleDefinitions
      />,
    );

    await user.click(screen.getByRole("button", { name: /^edit$/i }));
    const input = screen.getByDisplayValue("Days");
    await user.clear(input);
    await user.type(input, "https://bad.example");

    expect(screen.getByText("Shift name cannot contain a URL")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^save$/i })).toBeDisabled();
    expect(upsertShiftCategory).not.toHaveBeenCalled();
  });

  it("job settings block invalid names before save", async () => {
    const user = userEvent.setup();
    const jobs: JobDefinition[] = [
      {
        id: 12,
        orgId: "org-1",
        name: "Office",
        abbr: "OFC",
        showOnGrid: true,
        assignmentMode: "shiftless",
        eligibleRoleIds: [],
        requiredCertificationIds: [],
        color: "#E2E8F0",
        border: "#CBD5E1",
        text: "#1E293B",
        defaultStartTime: null,
        defaultEndTime: null,
        defaultDurationHours: 4,
        defaultDurationMinutes: 0,
        sortOrder: 0,
        systemKey: null,
        archivedAt: null,
      },
    ];

    render(
      <JobsSettings
        jobs={jobs}
        orgId="org-1"
        orgRoles={[]}
        certifications={[]}
        roleLabel="Roles"
        certificationLabel="Certifications"
        onChange={vi.fn()}
        canManageScheduleDefinitions
      />,
    );

    await user.click(screen.getByText("Office"));
    const input = screen.getByDisplayValue("Office");
    await user.clear(input);
    await user.type(input, "https://bad.example");

    expect(screen.getByText("Job name cannot contain a URL")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^save$/i })).toBeDisabled();
    expect(upsertJobDefinition).not.toHaveBeenCalled();
  });

  it("absence type settings block invalid names before save", async () => {
    const user = userEvent.setup();
    const absenceTypes: AbsenceType[] = [
      {
        id: 2,
        orgId: "org-1",
        label: "VAC",
        name: "Vacation",
        color: "#E2E8F0",
        border: "transparent",
        text: "#1E293B",
        sortOrder: 0,
        archivedAt: null,
      },
    ];

    render(
      <AbsenceTypesSettings
        absenceTypes={absenceTypes}
        orgId="org-1"
        onChange={vi.fn()}
        canManageScheduleDefinitions
        shiftDisplayMode="code"
      />,
    );

    await user.click(screen.getByText("Vacation"));
    const input = screen.getByDisplayValue("Vacation");
    await user.clear(input);
    await user.type(input, "https://bad.example");

    expect(screen.getByText("Absence name cannot contain a URL")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^save$/i })).toBeDisabled();
  });
});
