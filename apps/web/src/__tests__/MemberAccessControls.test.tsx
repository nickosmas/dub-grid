import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { MemberAccessControls } from "@/components/staff/MemberAccessControls";

const stepUpRun = vi.fn();

vi.mock("@/hooks/useStepUpAction", () => ({
  useStepUpAction: () => ({ run: stepUpRun, dialog: null }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const stepUpRequired = () =>
  Object.assign(new Error("x"), { status: 403, code: "STEP_UP_REQUIRED", method: "password" });

describe("MemberAccessControls: a cancelled step-up (F-69)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stepUpRun.mockResolvedValue(false);
  });

  async function confirmRoleChange(onRoleChange: () => Promise<void>) {
    const user = userEvent.setup();
    render(<MemberAccessControls orgRole="user" onRoleChange={onRoleChange} />);
    await user.click(screen.getByRole("button", { name: "User" }));
    await user.click(await screen.findByRole("option", { name: "Admin" }));
    await user.click(await screen.findByRole("button", { name: "Change role" }));
  }

  it("changes no role and reports no success when step-up is cancelled before the action", async () => {
    const onRoleChange = vi.fn().mockResolvedValue(undefined);

    await confirmRoleChange(onRoleChange);

    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Change role" })).not.toBeInTheDocument(),
    );
    expect(stepUpRun).toHaveBeenCalledTimes(1);
    expect(onRoleChange).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("reports no success when the first attempt needed step-up and the dialog was cancelled", async () => {
    const onRoleChange = vi.fn().mockRejectedValue(stepUpRequired());
    stepUpRun.mockImplementation(async (action: (token: string) => Promise<unknown>) => {
      await action("stale-token").catch(() => undefined);
      return false;
    });

    await confirmRoleChange(onRoleChange);

    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Change role" })).not.toBeInTheDocument(),
    );
    expect(onRoleChange).toHaveBeenCalledTimes(1);
    expect(onRoleChange).toHaveBeenCalledWith("admin", "stale-token");
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("keeps the permissions editor open when step-up is cancelled on save", async () => {
    const user = userEvent.setup();
    const onPermissionsChange = vi.fn().mockResolvedValue(undefined);
    render(
      <MemberAccessControls
        orgRole="admin"
        adminPermissions={null}
        onPermissionsChange={onPermissionsChange}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Edit admin access" }));
    await user.click(await screen.findByRole("switch", { name: "Coverage view" }));
    await user.click(screen.getByRole("button", { name: /^save$/i }));
    await user.click(await screen.findByRole("button", { name: /confirm save/i }));

    await waitFor(() => expect(stepUpRun).toHaveBeenCalledTimes(1));
    expect(onPermissionsChange).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /confirm save/i })).toBeEnabled();
    expect(
      screen.getByRole("dialog", { name: "Edit permissions", hidden: true }),
    ).toBeInTheDocument();
  });
});
