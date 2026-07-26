import React from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

let currentSection = "schedule-jobs";

vi.mock("next/navigation", () => ({
  useSearchParams: () => ({
    get: (key: string) => (key === "section" ? currentSection : null),
  }),
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    className,
    replace: _replace,
  }: {
    href: string;
    children: React.ReactNode;
    className?: string;
    replace?: boolean;
    [key: string]: unknown;
  }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

vi.mock("@/components/MobileSubNavContext", () => ({
  useSetMobileSubNav: () => undefined,
}));

vi.mock("@/components/ui/sidebar", () => {
  const React = require("react") as typeof import("react");

  const passthrough = ({
    children,
    className,
    style,
  }: {
    children?: React.ReactNode;
    className?: string;
    style?: React.CSSProperties;
  }) => (
    <div className={className} style={style}>
      {children}
    </div>
  );

  return {
    SidebarProvider: passthrough,
    Sidebar: passthrough,
    SidebarContent: passthrough,
    SidebarGroup: passthrough,
    SidebarGroupLabel: passthrough,
    SidebarGroupContent: passthrough,
    SidebarMenu: passthrough,
    SidebarMenuItem: passthrough,
    SidebarFooter: passthrough,
    SidebarMenuButton: ({
      render,
      children,
    }: {
      render?: React.ReactElement;
      children?: React.ReactNode;
    }) =>
      render ? (
        React.cloneElement(render, undefined, children)
      ) : (
        <button type="button">{children}</button>
      ),
  };
});

vi.mock("@/components/settings/OrganizationGeneral", () => ({
  default: () => <div>Organization general</div>,
}));

vi.mock("@/components/settings/OrganizationLabels", () => ({
  default: () => <div>Organization labels</div>,
}));

vi.mock("@/components/settings/BillingSettings", () => ({
  default: () => <div>Billing settings</div>,
}));

vi.mock("@/components/settings/DisplayMode", () => ({
  default: () => <div>Display mode</div>,
}));

vi.mock("@/components/settings/ScheduleRules", () => ({
  default: () => <div>Schedule rules</div>,
}));

vi.mock("@/components/settings/ShiftCategories", () => ({
  default: () => <div>Shift categories</div>,
}));

vi.mock("@/components/settings/Jobs", () => ({
  default: () => <div>Jobs</div>,
}));

vi.mock("@/components/settings/AbsenceTypes", () => ({
  default: () => <div>Absence types</div>,
}));

vi.mock("@/components/settings/Coverage", () => ({
  default: () => <div>Coverage</div>,
}));

vi.mock("@/components/settings/StringListSettings", () => ({
  default: () => <div>String list</div>,
}));

vi.mock("@/components/settings/DepartmentsSettings", () => ({
  default: () => <div>Departments</div>,
}));

vi.mock("@/components/settings/Indicators", () => ({
  default: () => <div>Indicators</div>,
}));

import SettingsPage from "@/components/settings/SettingsPage";

const organization = {
  id: "org-1",
  focusAreaLabel: "Units",
  certificationLabel: "Certifications",
  roleLabel: "Roles",
  departmentLabel: "Scheduled Departments",
  shiftDisplayMode: "name",
  updatedAt: "2026-01-01T00:00:00.000Z",
} as const;

const baseProps = {
  organization: organization as never,
  focusAreas: [],
  shiftCategories: [],
  jobs: [],
  indicatorTypes: [],
  certifications: [],
  orgRoles: [],
  departments: [],
  coverageRequirements: [],
  absenceTypes: [],
  onOrganizationSave: vi.fn(),
  onFocusAreasChange: vi.fn(),
  onShiftCategoriesChange: vi.fn(),
  onJobsChange: vi.fn(),
  onIndicatorTypesChange: vi.fn(),
  onCertificationsChange: vi.fn(),
  onOrgRolesChange: vi.fn(),
  onDepartmentsChange: vi.fn(),
  onCoverageRequirementsChange: vi.fn(),
  onAbsenceTypesChange: vi.fn(),
  canManageOrg: true,
  canAccessSettings: true,
  isSuperAdmin: true,
  isGridmaster: false,
  canManageOrgLabels: true,
  canViewOrgLabels: true,
  canManageFocusAreas: true,
  canViewFocusAreas: true,
  canManageScheduleDefinitions: true,
  canViewScheduleDefinitions: true,
  canManageIndicatorTypes: true,
  canViewIndicatorTypes: true,
  canManageOrgSettings: true,
  canManageCoverageRequirements: true,
  canViewCoverageRequirements: true,
};

describe("SettingsPage title help", () => {
  beforeEach(() => {
    currentSection = "schedule-jobs";
    localStorage.clear();
  });

  it("renders the shared heading label as visible copy instead of a help button", () => {
    render(<SettingsPage {...baseProps} />);

    expect(
      screen.getByText(
        "Define responsibilities like Supervisor, Mentor, Nurse, and Office, including assignment rules and grid visibility.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Help" })).not.toBeInTheDocument();
  });

  it("does not render a shared help hint for sections without title help", () => {
    currentSection = "org-general";

    render(<SettingsPage {...baseProps} />);

    expect(
      screen.queryByText(
        "Define responsibilities like Supervisor, Mentor, Nurse, and Office, including assignment rules and grid visibility.",
      ),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Help" })).not.toBeInTheDocument();
  });
});
