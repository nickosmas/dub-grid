import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ActivityTab } from "@/components/staff-detail/tabs/ActivityTab";
import { makeEmployee } from "@/__tests__/factories";
import type { AuditLogEntry, Invitation } from "@/types";

describe("ActivityTab", () => {
  it("renders people activity as the shared app table pattern", () => {
    const roleHistory: AuditLogEntry[] = [
      {
        id: "role-1",
        targetUserId: "user-1",
        targetEmail: "sam@example.com",
        changedById: "admin-1",
        changedByEmail: "alex.admin@example.com",
        fromRole: "user",
        toRole: "admin",
        createdAt: "2026-01-03T10:00:00.000Z",
        orgId: "org-1",
        orgName: "DubGrid",
      },
    ];
    const invitations: Invitation[] = [
      {
        id: "invite-1",
        orgId: "org-1",
        invitedBy: "admin-1",
        email: "sam@example.com",
        roleToAssign: "user",
        expiresAt: "2099-01-10T10:00:00.000Z",
        acceptedAt: null,
        revokedAt: null,
        createdAt: "2026-01-02T10:00:00.000Z",
        updatedAt: null,
        employeeId: "emp-1",
      },
    ];

    render(
      <ActivityTab
        employee={makeEmployee({ firstName: "Sam", lastName: "Rivera" })}
        roleHistory={roleHistory}
        invitations={invitations}
      />,
    );

    const table = screen.getByRole("table");
    expect(within(table).getByRole("columnheader", { name: "When" })).toBeInTheDocument();
    expect(within(table).getByRole("columnheader", { name: "Type" })).toBeInTheDocument();
    expect(within(table).getByRole("columnheader", { name: "Activity" })).toBeInTheDocument();
    expect(within(table).getByRole("columnheader", { name: "Details" })).toBeInTheDocument();
    expect(within(table).getAllByRole("row")).toHaveLength(3);
    expect(screen.getByText("Role changed")).toBeInTheDocument();
    expect(screen.getByText("Invitation sent to sam@example.com")).toBeInTheDocument();
    expect(screen.getByText("Admin")).toBeInTheDocument();
    expect(screen.getAllByText("User").length).toBeGreaterThan(0);
    expect(screen.getByText(/as User/)).toBeInTheDocument();
  });
});
