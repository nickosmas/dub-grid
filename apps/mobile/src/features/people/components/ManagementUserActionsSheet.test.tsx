import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { MobileManagementUser } from "@dubgrid/contracts";
import { createReactNativeModule } from "../../../test/native";

const useMutation = vi.fn();
vi.mock("react-native", async () => createReactNativeModule(await import("react")));
vi.mock("@tanstack/react-query", () => ({
  onlineManager: { isOnline: () => true },
  useMutation,
  useQueryClient: () => ({ invalidateQueries: vi.fn().mockResolvedValue(undefined) }),
}));
vi.mock("../../auth/hooks/useAccessToken", () => ({ useAccessToken: () => "test-token" }));
vi.mock("../../../shared/providers/ToastProvider", () => ({
  useToast: () => ({ pushToast: vi.fn() }),
}));

let ManagementUserActionsSheet: (typeof import("./ManagementUserActionsSheet"))["ManagementUserActionsSheet"];
beforeAll(async () => {
  ManagementUserActionsSheet = (await import("./ManagementUserActionsSheet"))
    .ManagementUserActionsSheet;
});

const user = {
  id: "member-1",
  source: "member",
  userId: "user-1",
  employeeId: null,
  employeeStatus: null,
  firstName: "Mina",
  lastName: "Diaz",
  email: "mina@example.com",
  phone: "",
  orgRole: "admin",
  managementDepartmentIds: [9],
  managementDeptAdminIds: [],
  updatedAt: null,
  invitationId: null,
  invitationExpiresAt: null,
} satisfies MobileManagementUser;

describe("management confirmation errors", () => {
  beforeEach(() => {
    useMutation.mockImplementation(
      (options: { onError: (error: Error) => void; onMutate?: () => void }) => ({
        isPending: false,
        mutate: (_input: unknown, callbacks?: { onSettled?: () => void }) => {
          options.onMutate?.();
          options.onError(new Error("Request unavailable"));
          callbacks?.onSettled?.();
        },
        mutateAsync: async () => {
          options.onMutate?.();
          options.onError(new Error("Request unavailable"));
        },
      }),
    );
  });

  it.each([
    ["member", "Remove from Management", "Remove access"],
    ["pending_invite", "Reinvite", "Reissue Invitation"],
    ["pending_invite", "Revoke Invitation", "Revoke Invitation"],
  ] as const)(
    "shows %s / %s failures in the active confirmation",
    async (source, trigger, confirm) => {
      render(
        <ManagementUserActionsSheet
          managementUser={{ ...user, source }}
          managementDepartments={[]}
          onDismiss={vi.fn()}
        />,
      );
      fireEvent.click(screen.getByRole("button", { name: trigger }));
      await act(async () => {
        fireEvent.click(within(screen.getByRole("alert")).getByRole("button", { name: confirm }));
      });
      expect(
        within(screen.getByRole("alert")).getByText("Request unavailable"),
      ).toBeInTheDocument();
      fireEvent.click(within(screen.getByRole("alert")).getByRole("button", { name: "Cancel" }));
      fireEvent.click(screen.getByRole("button", { name: trigger }));
      expect(within(screen.getByRole("alert")).queryByText("Request unavailable")).toBeNull();
    },
  );
});
