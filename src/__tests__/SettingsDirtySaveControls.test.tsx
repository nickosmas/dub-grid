import { render, screen, waitFor } from "@testing-library/react";
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
import ShiftCodesSettings from "@/components/settings/ShiftCodes";
import { saveCoverageRequirements, updateOrganizationSettings, upsertIndicatorType } from "@/lib/db";
import { makeCoverageRequirement, makeFocusArea, makeShiftCategory, makeShiftCode } from "./factories";
import type { AbsenceType, Department, FocusArea, IndicatorType, NamedItem, Organization, ShiftCategory, ShiftCode } from "@/types";

vi.mock("@/lib/db", () => ({
  updateOrganization: vi.fn(),
  updateOrganizationSettings: vi.fn(),
  OrganizationSettingsConflictError: class OrganizationSettingsConflictError extends Error {
    latestOrganization: Organization;

    constructor(latestOrganization: Organization) {
      super("Organization settings were updated by someone else.");
      this.latestOrganization = latestOrganization;
      this.name = "OrganizationSettingsConflictError";
    }
  },
  upsertIndicatorType: vi.fn(),
  deleteIndicatorType: vi.fn(),
  saveDepartments: vi.fn(),
  saveCoverageRequirements: vi.fn(),
  upsertFocusArea: vi.fn(),
  deleteFocusArea: vi.fn(),
  checkDepartmentDependencies: vi.fn(),
  upsertShiftCode: vi.fn(),
  deleteShiftCode: vi.fn(),
  upsertAbsenceType: vi.fn(),
  deleteAbsenceType: vi.fn(),
  checkShiftCodeDependencies: vi.fn(),
  checkAbsenceTypeDependencies: vi.fn(),
}));

vi.mock("@/lib/sentry", () => ({
  captureException: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
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
  enforceConflictPrevention: true,
  dataRetentionDays: 90,
  featureOverrides: {},
  updatedAt: "2026-04-15T18:00:00.000000+00:00",
};

describe("settings dirty save controls", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("organization settings only show Discard while the draft is dirty", async () => {
    const user = userEvent.setup();

    render(
      <OrganizationGeneral
        organization={baseOrganization}
        onSave={vi.fn()}
      />,
    );

    const nameInput = screen.getByDisplayValue("Acme Health");
    const saveButton = screen.getByRole("button", { name: /review & save/i });
    expect(saveButton).toBeDisabled();
    expect(screen.queryByRole("button", { name: /^discard$/i })).not.toBeInTheDocument();

    await user.clear(nameInput);
    await user.type(nameInput, "Acme North");

    const cancelButton = screen.getByRole("button", { name: /^discard$/i });
    expect(saveButton).toBeEnabled();
    expect(cancelButton).toBeEnabled();

    await user.click(cancelButton);

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

    render(
      <OrganizationGeneral
        organization={baseOrganization}
        onSave={onSave}
      />,
    );

    const nameInput = screen.getByDisplayValue("Acme Health");
    await user.clear(nameInput);
    await user.type(nameInput, "Acme North");

    await user.click(screen.getByRole("button", { name: /review & save/i }));

    expect(screen.getByText(/review organization changes/i)).toBeInTheDocument();
    expect(screen.getByText("Organization Name")).toBeInTheDocument();
    expect(updateOrganizationSettings).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /confirm save/i }));

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

  it("organization labels only show Discard while the labels are dirty", async () => {
    const user = userEvent.setup();

    render(
      <OrganizationLabels
        organization={baseOrganization}
        onSave={vi.fn()}
      />,
    );

    const labelInput = screen.getByDisplayValue("Focus Areas");
    const saveButton = screen.getByRole("button", { name: /^save$/i });
    expect(screen.queryByRole("button", { name: /^discard$/i })).not.toBeInTheDocument();

    await user.clear(labelInput);
    await user.type(labelInput, "Units");

    const cancelButton = screen.getByRole("button", { name: /^discard$/i });
    expect(saveButton).toBeEnabled();
    expect(cancelButton).toBeEnabled();

    await user.click(cancelButton);

    expect(screen.getByDisplayValue("Focus Areas")).toBeInTheDocument();
    expect(saveButton).toBeDisabled();
    expect(screen.queryByRole("button", { name: /^discard$/i })).not.toBeInTheDocument();
  });

  it("display mode uses Cancel while the mode selection is dirty", async () => {
    const user = userEvent.setup();

    render(
      <DisplayMode
        organization={baseOrganization}
        shiftCodes={[]}
        onSave={vi.fn()}
      />,
    );

    const saveButton = screen.getByRole("button", { name: /^save$/i });
    expect(saveButton).toBeDisabled();
    expect(screen.queryByRole("button", { name: /^cancel$/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /full names/i }));

    const cancelButton = screen.getByRole("button", { name: /^cancel$/i });
    expect(screen.getByText(/display mode guide/i)).toBeInTheDocument();
    expect(screen.getByText(/grid cells show full shift names/i)).toBeInTheDocument();
    expect(saveButton).toBeEnabled();
    expect(cancelButton).toBeEnabled();

    await user.click(cancelButton);

    expect(screen.getByText(/grid cells stay compact with short codes/i)).toBeInTheDocument();
    expect(saveButton).toBeDisabled();
    expect(screen.queryByRole("button", { name: /^cancel$/i })).not.toBeInTheDocument();
  });

  it("schedule rules only expose Save for a modified toggle", async () => {
    const user = userEvent.setup();

    render(
      <ScheduleRules
        organization={baseOrganization}
        onOrganizationSave={vi.fn()}
      />,
    );

    const toggle = screen.getByRole("button", { name: /enforce shift conflict prevention/i });
    const saveButton = screen.getByRole("button", { name: /^save$/i });

    expect(saveButton).toBeDisabled();
    expect(screen.queryByRole("button", { name: /^cancel$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^close$/i })).not.toBeInTheDocument();

    await user.click(toggle);

    expect(saveButton).toBeEnabled();
    expect(screen.queryByRole("button", { name: /^cancel$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^close$/i })).not.toBeInTheDocument();
  });

  it("disables indicator Save until a row changes, then disables it again after save", async () => {
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

    await user.click(screen.getByRole("button", { name: /^edit$/i }));

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

    await waitFor(() => {
      expect(saveButton).toBeDisabled();
    });
    expect(screen.getByRole("button", { name: /^close$/i })).toBeInTheDocument();
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

    await user.click(screen.getByRole("button", { name: /^edit$/i }));

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

  it("indicator rows prompt before switching away from dirty edits", async () => {
    const user = userEvent.setup();
    const indicators: IndicatorType[] = [
      {
        id: 1,
        orgId: "org-1",
        name: "Readings",
        color: "#ff0000",
        sortOrder: 0,
      },
      {
        id: 2,
        orgId: "org-1",
        name: "Isolation",
        color: "#00aa00",
        sortOrder: 1,
      },
    ];

    render(
      <Indicators
        indicatorTypes={indicators}
        orgId="org-1"
        onChange={vi.fn()}
        canManageIndicatorTypes
      />,
    );

    await user.click(screen.getAllByRole("button", { name: /^edit$/i })[0]);

    const input = screen.getByDisplayValue("Readings");
    await user.clear(input);
    await user.type(input, "Daily Readings");

    await user.click(screen.getByRole("button", { name: /^edit$/i }));

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

    await userEvent.setup().click(screen.getByRole("button", { name: /^edit$/i }));

    const input = screen.getByDisplayValue("Readings");
    const saveButton = screen.getByRole("button", { name: /^save$/i });
    const inputRow = input.closest("div");
    const actionRow = saveButton.parentElement;

    expect(inputRow).not.toBeNull();
    expect(actionRow).not.toBeNull();
    expect(inputRow).not.toBe(actionRow);
    const relation =
      inputRow?.compareDocumentPosition(actionRow as Node)
      ?? 0;
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

  it("coverage edit mode swaps Close for Discard without leaving the editor", async () => {
    const user = userEvent.setup();
    const focusArea = makeFocusArea({ id: 1, orgId: "org-1", name: "ICU" });
    const shiftCategory = makeShiftCategory({ id: 10, orgId: "org-1", name: "Days", focusAreaId: 1 });
    const shiftCode = makeShiftCode({
      id: 100,
      orgId: "org-1",
      label: "D",
      name: "Day",
      categoryId: 10,
      focusAreaId: 1,
    });
    const requirement = makeCoverageRequirement({
      id: 50,
      orgId: "org-1",
      focusAreaId: 1,
      shiftCodeId: 100,
      minStaff: 2,
    });

    vi.mocked(saveCoverageRequirements).mockResolvedValue([requirement]);

    render(
      <CoverageRequirementsSettings
        orgId="org-1"
        focusAreas={[focusArea]}
        shiftCategories={[shiftCategory]}
        shiftCodes={[shiftCode]}
        coverageRequirements={[requirement]}
        onCoverageRequirementsChange={vi.fn()}
        canEdit
      />,
    );

    await user.click(screen.getByRole("button", { name: /^edit$/i }));

    const staffInput = screen.getByRole("spinbutton");
    const cancelButton = screen.getByRole("button", { name: /^close$/i });
    const saveButton = screen.getByRole("button", { name: /^save$/i });

    expect(staffInput.compareDocumentPosition(cancelButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(cancelButton.compareDocumentPosition(saveButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    await user.clear(staffInput);
    await user.type(staffInput, "3");
    expect(screen.getByRole("button", { name: /^discard$/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^close$/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^discard$/i }));

    expect(screen.getByRole("spinbutton")).toHaveValue(2);
    expect(screen.getByRole("button", { name: /^close$/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^discard$/i })).not.toBeInTheDocument();
  });

  it("shows Close in clean string list edit mode and swaps to Discard without leaving edit mode", async () => {
    const user = userEvent.setup();
    const items: NamedItem[] = [
      { id: 1, orgId: "org-1", name: "Charge", abbr: "CH", sortOrder: 0, departmentId: null },
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
    expect(input.compareDocumentPosition(cancelButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(cancelButton.compareDocumentPosition(saveButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
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

  it("shows Close in clean departments edit mode and swaps to Discard without leaving edit mode", async () => {
    const user = userEvent.setup();
    const departments: Department[] = [
      { id: 1, orgId: "org-1", name: "North", abbr: "North", type: "scheduled", sortOrder: 0, archivedAt: null },
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
        canManageOrgLabels={false}
        onDepartmentsChange={vi.fn()}
        onFocusAreasChange={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: /^edit$/i }));

    const input = screen.getByDisplayValue("North");
    const cancelButton = screen.getByRole("button", { name: /^close$/i });
    const saveButton = screen.getByRole("button", { name: /^save$/i });
    expect(input.compareDocumentPosition(cancelButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(cancelButton.compareDocumentPosition(saveButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
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

  it("shift category editors prompt before switching away from dirty edits", async () => {
    const user = userEvent.setup();
    const focusArea = makeFocusArea({ id: 1, orgId: "org-1", name: "ICU" });
    const shiftCategories: ShiftCategory[] = [
      makeShiftCategory({ id: 10, orgId: "org-1", name: "Days", focusAreaId: 1 }),
      makeShiftCategory({ id: 11, orgId: "org-1", name: "Nights", focusAreaId: 1, sortOrder: 1 }),
    ];

    render(
      <ShiftCategoriesSettings
        shiftCategories={shiftCategories}
        focusAreas={[focusArea]}
        orgId="org-1"
        onChange={vi.fn()}
        canManageShiftCodes
        shiftCodes={[]}
        onShiftCodesChange={vi.fn()}
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

  it("disables schedule-code Save when the saved custom times only mirror the category", async () => {
    const user = userEvent.setup();
    const shiftCategories: ShiftCategory[] = [
      {
        id: 10,
        orgId: "org-1",
        name: "Day Category",
        color: "#E2E8F0",
        startTime: "07:00",
        endTime: "15:00",
        breakMinutes: null,
        sortOrder: 0,
        focusAreaId: null,
        archivedAt: null,
      },
    ];
    const shiftCodes: ShiftCode[] = [
      {
        id: 1,
        orgId: "org-1",
        label: "D",
        name: "Day Shift",
        color: "#E2E8F0",
        border: "transparent",
        text: "#1E293B",
        categoryId: 10,
        focusAreaId: null,
        sortOrder: 0,
        requiredCertificationIds: [],
        defaultStartTime: "07:00:00",
        defaultEndTime: "15:00:00",
        defaultDurationHours: null,
        defaultDurationMinutes: null,
        archivedAt: null,
      },
    ];

    render(
      <ShiftCodesSettings
        shiftCodes={shiftCodes}
        focusAreas={[]}
        shiftCategories={shiftCategories}
        orgId="org-1"
        certifications={[]}
        certificationLabel="Certifications"
        focusAreaLabel="Focus Areas"
        onChange={vi.fn()}
        canManageShiftCodes
        absenceTypes={[]}
        onAbsenceTypesChange={vi.fn()}
        shiftDisplayMode="code"
      />,
    );

    await user.click(screen.getByText("Day Shift"));

    const saveButton = screen.getByRole("button", { name: /^save$/i });
    expect(saveButton).toBeDisabled();

    const nameInput = screen.getByDisplayValue("Day Shift");
    await user.clear(nameInput);
    await user.type(nameInput, "Day Shift Updated");
    expect(saveButton).toBeEnabled();

    await user.clear(nameInput);
    await user.type(nameInput, "Day Shift");
    expect(saveButton).toBeDisabled();
  });

  it("shift code editors swap Close for Discard and prompt before collapsing dirty edits", async () => {
    const user = userEvent.setup();
    const shiftCategories: ShiftCategory[] = [
      {
        id: 10,
        orgId: "org-1",
        name: "Day Category",
        color: "#E2E8F0",
        startTime: "07:00",
        endTime: "15:00",
        breakMinutes: null,
        sortOrder: 0,
        focusAreaId: null,
        archivedAt: null,
      },
    ];
    const shiftCodes: ShiftCode[] = [
      {
        id: 1,
        orgId: "org-1",
        label: "D",
        name: "Day Shift",
        color: "#E2E8F0",
        border: "transparent",
        text: "#1E293B",
        categoryId: 10,
        focusAreaId: null,
        sortOrder: 0,
        requiredCertificationIds: [],
        defaultStartTime: null,
        defaultEndTime: null,
        defaultDurationHours: null,
        defaultDurationMinutes: null,
        archivedAt: null,
      },
    ];

    render(
      <ShiftCodesSettings
        shiftCodes={shiftCodes}
        focusAreas={[]}
        shiftCategories={shiftCategories}
        orgId="org-1"
        certifications={[]}
        certificationLabel="Certifications"
        focusAreaLabel="Focus Areas"
        onChange={vi.fn()}
        canManageShiftCodes
        absenceTypes={[]}
        onAbsenceTypesChange={vi.fn()}
        shiftDisplayMode="code"
      />,
    );

    await user.click(screen.getByText("Day Shift"));

    expect(screen.getByRole("button", { name: /^close$/i })).toBeInTheDocument();

    const nameInput = screen.getByDisplayValue("Day Shift");
    await user.clear(nameInput);
    await user.type(nameInput, "Day Shift Updated");

    expect(screen.getByRole("button", { name: /^discard$/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^close$/i })).not.toBeInTheDocument();

    await user.click(screen.getByText("Day Shift Updated"));

    expect(await screen.findByRole("dialog", { name: /unsaved changes/i })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /keep editing/i }));

    expect(screen.queryByRole("dialog", { name: /unsaved changes/i })).not.toBeInTheDocument();
    expect(screen.getByDisplayValue("Day Shift Updated")).toBeInTheDocument();
  });

  it("disables off-day Save until there is a real persisted-value change", async () => {
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
      <ShiftCodesSettings
        shiftCodes={[]}
        focusAreas={[]}
        shiftCategories={[]}
        orgId="org-1"
        certifications={[]}
        certificationLabel="Certifications"
        focusAreaLabel="Focus Areas"
        onChange={vi.fn()}
        canManageShiftCodes
        absenceTypes={absenceTypes}
        onAbsenceTypesChange={vi.fn()}
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
});
