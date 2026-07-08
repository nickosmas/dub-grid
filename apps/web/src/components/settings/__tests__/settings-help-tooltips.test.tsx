import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import DepartmentsSettings from "@/components/settings/DepartmentsSettings";
import DisplayMode from "@/components/settings/DisplayMode";
import Coverage from "@/components/settings/Coverage";
import Jobs from "@/components/settings/Jobs";
import OrganizationLabels from "@/components/settings/OrganizationLabels";
import StringListSettings from "@/components/settings/StringListSettings";
import AbsenceTypes from "@/components/settings/AbsenceTypes";

const organization = {
  id: "org-1",
  focusAreaLabel: "Units",
  certificationLabel: "Certifications",
  roleLabel: "Roles",
  departmentLabel: "Scheduled Departments",
  shiftDisplayMode: "name",
  updatedAt: "2026-01-01T00:00:00.000Z",
} as const;

const scheduledDepartment = {
  id: 1,
  orgId: "org-1",
  name: "Operations",
  abbr: "Operations",
  type: "scheduled",
  sortOrder: 0,
  archivedAt: null,
} as const;

const managementDepartment = {
  id: 2,
  orgId: "org-1",
  name: "Administration",
  abbr: "Administration",
  type: "management",
  sortOrder: 0,
  archivedAt: null,
} as const;

const focusArea = {
  id: 11,
  orgId: "org-1",
  departmentId: 1,
  name: "East Wing",
  sortOrder: 0,
  archivedAt: null,
} as const;

const shiftCategory = {
  id: 21,
  orgId: "org-1",
  focusAreaId: 11,
  name: "Day Shift",
  abbr: "D",
  color: "#BFDBFE",
  startTime: "07:00",
  endTime: "19:00",
  sortOrder: 0,
  archivedAt: null,
} as const;

const scheduleRole = {
  id: 31,
  orgId: "org-1",
  name: "Supervisor",
  abbr: "SUPV",
  sortOrder: 0,
  departmentId: null,
  isScheduleRole: true,
} as const;

const certification = {
  id: 41,
  orgId: "org-1",
  name: "Level 2",
  abbr: "L2",
  sortOrder: 0,
  departmentId: null,
  isScheduleRole: undefined,
} as const;

describe("settings help cleanup", () => {
  it("removes the custom labels explainer and shows visible inline field hints", () => {
    render(<OrganizationLabels organization={organization as never} onSave={vi.fn()} />);

    expect(screen.queryByText("How custom labels work")).not.toBeInTheDocument();
    expect(screen.getByText("e.g. Focus Areas, Departments, Units")).toBeInTheDocument();
    expect(screen.getByText("e.g. Certifications, Designations")).toBeInTheDocument();
    expect(screen.getByText("e.g. Responsibilities, Positions")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Help" })).not.toBeInTheDocument();
  });

  it("shows visible heading labels for scheduled and management department sections", () => {
    render(
      <DepartmentsSettings
        departments={[scheduledDepartment, managementDepartment] as never}
        focusAreas={[focusArea] as never}
        orgId="org-1"
        focusAreaLabel="Units"
        departmentLabel="Scheduled Departments"
        canManageFocusAreas
        canManageOrgLabels
        onDepartmentsChange={vi.fn()}
        onFocusAreasChange={vi.fn()}
      />,
    );

    expect(screen.queryByText("Department structure")).not.toBeInTheDocument();
    expect(
      screen.getByText(
        "Scheduled Departments appear on the grid. Each one has one or more units that define how staff are grouped on the schedule.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "For people who use the app but don't appear on the schedule (e.g. HR, Reception, Finance).",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Help" })).not.toBeInTheDocument();
  });

  it("shows the schedule eligibility help once at the column level", () => {
    render(
      <StringListSettings
        label="Roles"
        items={
          [
            { ...scheduleRole, departmentId: 1 },
            { ...scheduleRole, id: 32, name: "Lead", abbr: "LEAD", departmentId: 1 },
          ] as never
        }
        onSave={vi.fn().mockResolvedValue(undefined)}
        placeholder="e.g. Charge Nurse"
        initialEditing
        showScheduleRoleToggle
        scheduleEligibilityHelpText="Only schedule-eligible roles can limit jobs."
        departments={[scheduledDepartment] as never}
      />,
    );

    const fullNameHeader = screen.getByText("Full Name").closest("div");
    const abbreviationHeader = screen.getByText("Abbreviation").closest("div");
    const scheduleEligibilityHeader = screen
      .getByText("Only schedule-eligible roles can limit jobs.")
      .closest("div");
    const departmentHeader = screen.getByText("Department").closest("div");
    const helpText = screen.getByText("Only schedule-eligible roles can limit jobs.");
    const headerCell = helpText.closest("div");
    const editRow = screen.getByDisplayValue("Supervisor").closest(".dg-settings-reorder-item");
    const editCheckbox = editRow?.querySelector('input[type="checkbox"]');

    expect(screen.getAllByText("Only schedule-eligible roles can limit jobs.")).toHaveLength(1);
    expect(fullNameHeader?.getAttribute("style")).not.toContain("padding-left");
    expect(abbreviationHeader?.getAttribute("style")).not.toContain("padding-left");
    expect(headerCell?.parentElement).toHaveStyle({ alignItems: "start" });
    expect(scheduleEligibilityHeader?.getAttribute("style")).not.toContain("padding-left");
    expect(departmentHeader?.getAttribute("style")).not.toContain("padding-left");
    expect(editRow).toHaveStyle({ alignItems: "start" });
    expect(editCheckbox).toHaveClass("dg-checkbox");
    expect(screen.queryByRole("button", { name: "Help" })).not.toBeInTheDocument();
  });

  it("shows visible eligibility labels on jobs instead of help buttons", () => {
    render(
      <Jobs
        jobs={
          [
            {
              id: 51,
              orgId: "org-1",
              name: "Office",
              abbr: "OFFICE",
              showOnGrid: true,
              assignmentMode: "shiftless",
              eligibleRoleIds: [],
              requiredCertificationIds: [],
              color: "#BFDBFE",
              border: "#93C5FD",
              text: "#1E3A8A",
              defaultStartTime: null,
              defaultEndTime: null,
              defaultDurationHours: null,
              defaultDurationMinutes: null,
              sortOrder: 0,
              systemKey: null,
              archivedAt: null,
            },
          ] as never
        }
        orgId="org-1"
        orgRoles={[scheduleRole] as never}
        certifications={[certification] as never}
        departments={[]}
        focusAreas={[]}
        shiftCategories={[]}
        roleLabel="Roles"
        certificationLabel="Certifications"
        onChange={vi.fn()}
        canManageScheduleDefinitions
        shiftDisplayMode="name"
      />,
    );

    fireEvent.click(screen.getByText("Office"));

    expect(screen.queryByText("Job logic")).not.toBeInTheDocument();
    expect(
      screen.getByText(
        "Use this for work that appears on its own without a paired shift, like Office or Admin.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getAllByText(
        "Pick any schedule-eligible roles and certifications that can qualify staff. Selections inside each list are alternatives. Leave either list empty to keep that gate open.",
      ).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getByText("Decide whether staff must match both lists, or just one."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Help" })).not.toBeInTheDocument();
  });

  it("removes the display mode, absence, and coverage explainers", () => {
    const { rerender } = render(
      <DisplayMode
        organization={organization as never}
        shiftCategories={[shiftCategory] as never}
        jobs={[]}
        onSave={vi.fn()}
      />,
    );

    expect(screen.queryByText("Display mode guide")).not.toBeInTheDocument();

    rerender(
      <AbsenceTypes
        absenceTypes={[]}
        orgId="org-1"
        onChange={vi.fn()}
        canManageScheduleDefinitions
        shiftDisplayMode="name"
      />,
    );

    expect(screen.queryByText("Absence logic")).not.toBeInTheDocument();

    rerender(
      <Coverage
        orgId="org-1"
        focusAreas={[]}
        shiftCategories={[]}
        jobs={[]}
        orgRoles={[]}
        certifications={[]}
        coverageRequirements={[]}
        onCoverageRequirementsChange={vi.fn()}
        canEdit
        shiftDisplayMode="name"
      />,
    );

    expect(screen.queryByText("Coverage logic")).not.toBeInTheDocument();
  });
});
