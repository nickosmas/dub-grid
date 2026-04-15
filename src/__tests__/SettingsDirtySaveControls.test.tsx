import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Indicators from "@/components/settings/Indicators";
import StringListSettings from "@/components/settings/StringListSettings";
import DepartmentsSettings from "@/components/settings/DepartmentsSettings";
import ShiftCodesSettings from "@/components/settings/ShiftCodes";
import { upsertIndicatorType } from "@/lib/db";
import type { AbsenceType, Department, FocusArea, IndicatorType, NamedItem, ShiftCategory, ShiftCode } from "@/types";

vi.mock("@/lib/db", () => ({
  upsertIndicatorType: vi.fn(),
  deleteIndicatorType: vi.fn(),
  saveDepartments: vi.fn(),
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

describe("settings dirty save controls", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

    const saveButton = screen.getByRole("button", { name: /^save$/i });
    expect(saveButton).toBeDisabled();

    const input = screen.getByDisplayValue("Readings");
    await user.clear(input);
    await user.type(input, "Daily Readings");
    expect(saveButton).toBeEnabled();

    vi.mocked(upsertIndicatorType).mockResolvedValue({
      ...indicator,
      name: "Daily Readings",
    });

    await user.click(saveButton);

    await waitFor(() => {
      expect(saveButton).toBeDisabled();
    });
  });

  it("shows Save All in string list edit mode but keeps it disabled until changes exist", async () => {
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

    const saveButton = screen.getByRole("button", { name: /save all/i });
    expect(saveButton).toBeDisabled();

    const input = screen.getByDisplayValue("Charge");
    await user.clear(input);
    await user.type(input, "Lead");
    expect(saveButton).toBeEnabled();

    await user.clear(input);
    await user.type(input, "Charge");
    expect(saveButton).toBeDisabled();
  });

  it("shows Save All in departments edit mode but keeps it disabled until changes exist", async () => {
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

    const saveButton = screen.getByRole("button", { name: /save all/i });
    expect(saveButton).toBeDisabled();

    const input = screen.getByDisplayValue("North");
    await user.clear(input);
    await user.type(input, "South");
    expect(saveButton).toBeEnabled();

    await user.clear(input);
    await user.type(input, "North");
    expect(saveButton).toBeDisabled();
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
