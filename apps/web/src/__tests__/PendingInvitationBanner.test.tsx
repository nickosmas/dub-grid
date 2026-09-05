import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { PendingInvitationBanner } from "@/components/staff/PendingInvitationBanner";
import type { Invitation } from "@/types";

const invitation: Invitation = {
  id: "inv-1",
  orgId: "org-1",
  invitedBy: "user-2",
  email: "new.hire@example.com",
  roleToAssign: "user",
  expiresAt: "2099-01-01T00:00:00.000Z",
  acceptedAt: null,
  revokedAt: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  employeeId: "emp-1",
};

describe("PendingInvitationBanner", () => {
  it("shows the pending invitation and its target email", () => {
    render(<PendingInvitationBanner pendingInvitation={invitation} onRevoke={vi.fn()} />);

    expect(screen.getByText("Invitation pending")).toBeInTheDocument();
    expect(screen.getByText("Sent to new.hire@example.com")).toBeInTheDocument();
  });

  it("hides the Reinvite button when onReinvite is omitted", () => {
    render(<PendingInvitationBanner pendingInvitation={invitation} onRevoke={vi.fn()} />);

    expect(screen.queryByRole("button", { name: "Reinvite" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Revoke" })).toBeInTheDocument();
  });

  it("confirms before calling onReinvite", async () => {
    const user = userEvent.setup();
    const onReinvite = vi.fn();

    render(
      <PendingInvitationBanner
        pendingInvitation={invitation}
        onReinvite={onReinvite}
        onRevoke={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Reinvite" }));
    expect(onReinvite).not.toHaveBeenCalled();

    expect(screen.getByText("Reissue Invitation?")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Reissue" }));
    expect(onReinvite).toHaveBeenCalledOnce();
  });

  it("confirms before calling onRevoke with the invitation id", async () => {
    const user = userEvent.setup();
    const onRevoke = vi.fn();

    render(<PendingInvitationBanner pendingInvitation={invitation} onRevoke={onRevoke} />);

    await user.click(screen.getByRole("button", { name: "Revoke" }));
    expect(onRevoke).not.toHaveBeenCalled();

    // The banner's trigger and the dialog's confirm are both "Revoke" now, so
    // scope to the dialog rather than matching whichever comes first.
    const confirmDialog = await screen.findByRole("dialog", { name: "Revoke Invitation?" });
    await user.click(within(confirmDialog).getByRole("button", { name: "Revoke" }));
    expect(onRevoke).toHaveBeenCalledWith("inv-1");
  });

  it("cancelling the confirm dialog does not call either callback", async () => {
    const user = userEvent.setup();
    const onRevoke = vi.fn();

    render(<PendingInvitationBanner pendingInvitation={invitation} onRevoke={onRevoke} />);

    await user.click(screen.getByRole("button", { name: "Revoke" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onRevoke).not.toHaveBeenCalled();
    expect(screen.queryByText("Revoke Invitation?")).not.toBeInTheDocument();
  });

  it("disables both actions with a tooltip in sandbox mode", () => {
    render(
      <PendingInvitationBanner
        pendingInvitation={invitation}
        onReinvite={vi.fn()}
        onRevoke={vi.fn()}
        isInSandbox
      />,
    );

    expect(screen.getByRole("button", { name: "Reinvite" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Revoke" })).toBeDisabled();
  });
});
