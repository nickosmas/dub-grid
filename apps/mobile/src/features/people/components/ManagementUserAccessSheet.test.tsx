import { fireEvent, render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { createReactNativeModule, createSafeAreaContextModule } from "../../../test/native";

vi.mock("react-native", async () => createReactNativeModule(await import("react")));

vi.mock("react-native-safe-area-context", async () =>
  createSafeAreaContextModule(await import("react")),
);

vi.mock("@expo/vector-icons/Ionicons", () => ({ default: () => null }));

let ManagementUserAccessSheet: (typeof import("./ManagementUserAccessSheet"))["ManagementUserAccessSheet"];

beforeAll(async () => {
  ManagementUserAccessSheet = (await import("./ManagementUserAccessSheet"))
    .ManagementUserAccessSheet;
});

const DEPARTMENTS = [
  { id: 9, name: "Operations", abbr: "OPS", type: "management" as const },
  { id: 10, name: "Facilities", abbr: "FAC", type: "management" as const },
];

function makeManagementUser(overrides: Record<string, unknown> = {}) {
  return {
    id: "u:user-1",
    source: "member",
    userId: "user-1",
    employeeId: null,
    employeeStatus: null,
    firstName: "Mina",
    lastName: "Diaz",
    email: "mina@dubgrid.com",
    phone: "",
    orgRole: "admin",
    managementDepartmentIds: [9],
    managementDeptAdminIds: [],
    updatedAt: "2026-04-28T00:00:00.000Z",
    invitationId: null,
    invitationExpiresAt: null,
    ...overrides,
  };
}

function renderSheet(overrides: Record<string, unknown> = {}) {
  const onRemove = vi.fn();
  const onSubmit = vi.fn().mockResolvedValue(undefined);

  render(
    <ManagementUserAccessSheet
      isPending={false}
      managementDepartments={DEPARTMENTS}
      managementUser={makeManagementUser(overrides) as never}
      visible
      onDismiss={vi.fn()}
      onRemove={onRemove}
      onSubmit={onSubmit}
    />,
  );

  return { onRemove, onSubmit };
}

describe("ManagementUserAccessSheet", () => {
  // Clearing every chip is the removal path here, so an empty draft is a save
  // to hand upward rather than an error to block on. The parent owns the
  // prompt and the mutation, so this sheet only reports the intent.
  it("hands an emptied selection to onRemove rather than saving it", () => {
    const { onRemove, onSubmit } = renderSheet();

    fireEvent.click(screen.getByText("OPS"));

    expect(
      screen.getByText("Saving now takes them off the management roster."),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Save Access" }));

    expect(onRemove).toHaveBeenCalledOnce();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("says an emptied invitation is being revoked instead", () => {
    renderSheet({ source: "pending_invite", userId: null, invitationId: "inv-1" });

    fireEvent.click(screen.getByText("OPS"));

    expect(
      screen.getByText("Saving now revokes their pending management invitation."),
    ).toBeInTheDocument();
  });

  it("still saves an ordinary department change through onSubmit", () => {
    const { onRemove, onSubmit } = renderSheet();

    fireEvent.click(screen.getByText("FAC"));
    fireEvent.click(screen.getByRole("button", { name: "Save Access" }));

    expect(onRemove).not.toHaveBeenCalled();
    expect(onSubmit).toHaveBeenCalledWith({
      orgRole: "admin",
      managementDepartmentIds: [9, 10],
    });
  });

  // Same reason as everywhere else: a Save that is live on an untouched sheet
  // invites a no-op write.
  it("holds Save until something actually changes", () => {
    const { onRemove, onSubmit } = renderSheet();

    fireEvent.click(screen.getByRole("button", { name: "Save Access" }));

    expect(onRemove).not.toHaveBeenCalled();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
