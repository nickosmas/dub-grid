import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { InlineRoleSelect } from "@/components/staff/InlineRoleSelect";

const stepUpRun = vi.hoisted(() =>
  vi.fn(async (action: (token: string) => Promise<unknown>) => {
    await action("step-up-token");
    return true;
  }),
);
vi.mock("@/hooks/useStepUpAction", () => ({
  useStepUpAction: () => ({ run: stepUpRun, dialog: null }),
}));
const toastSuccess = vi.hoisted(() => vi.fn());
vi.mock("sonner", () => ({ toast: { success: toastSuccess, error: vi.fn() } }));

describe("InlineRoleSelect self-guard", () => {
  it("renders an editable role select for other people", () => {
    render(<InlineRoleSelect orgRole="admin" onChange={vi.fn()} />);
    // CustomSelect renders a listbox-trigger button.
    expect(screen.getByRole("button", { expanded: false })).toBeTruthy();
  });

  it("renders a disabled dropdown (grayed) for the current user", () => {
    render(<InlineRoleSelect orgRole="admin" onChange={vi.fn()} isSelf />);
    // The dropdown still renders so the column reads consistently, but the
    // trigger is aria-disabled so the user can't change their own role.
    const trigger = screen.getByRole("button");
    expect(trigger.getAttribute("aria-disabled")).toBe("true");
    expect(screen.getByText(/admin/i)).toBeTruthy();
  });

  it("asks before replacing a pending invitation's access", async () => {
    const onChange = vi.fn().mockResolvedValue(undefined);
    render(
      <InlineRoleSelect
        orgRole="user"
        onChange={onChange}
        pendingInvitationEmail="mina@example.com"
      />,
    );

    fireEvent.click(screen.getByRole("button", { expanded: false }));
    fireEvent.click(screen.getByRole("option", { name: "Admin" }));

    expect(screen.getByText("Change invitation access?")).toBeTruthy();
    expect(screen.getByText(/current invite link stops working immediately/i)).toBeTruthy();
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Change and resend" }));
    await waitFor(() => expect(onChange).toHaveBeenCalledWith("admin", "step-up-token"));
  });

  it("closes the confirmation without a success toast when step-up is cancelled", async () => {
    const onChange = vi.fn().mockResolvedValue(undefined);
    stepUpRun.mockClear();
    toastSuccess.mockClear();
    stepUpRun.mockResolvedValueOnce(false);
    render(<InlineRoleSelect orgRole="user" onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { expanded: false }));
    fireEvent.click(screen.getByRole("option", { name: "Admin" }));
    fireEvent.click(screen.getByRole("button", { name: "Change role" }));

    await waitFor(() => expect(screen.queryByRole("button", { name: "Change role" })).toBeNull());
    expect(stepUpRun).toHaveBeenCalledOnce();
    expect(onChange).not.toHaveBeenCalled();
    expect(toastSuccess).not.toHaveBeenCalled();
  });
});
