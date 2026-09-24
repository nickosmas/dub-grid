import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { useInvitationActionConfirm } from "@/components/staff/useInvitationActionConfirm";

/**
 * The gate every surface that revokes or reissues an invitation goes through.
 * What matters is that the caller cannot act until the answer comes back, and
 * that the wording names the consequence, since neither can be undone from the
 * invitee's side.
 */
function Harness({ onAnswer }: { onAnswer: (confirmed: boolean) => void }) {
  const { askToConfirm, confirmDialog } = useInvitationActionConfirm();
  return (
    <>
      {/* Not async handlers: the busy-button rule is about product buttons, and
          this harness only needs to hand the promise its answer. */}
      <button onClick={() => void askToConfirm("revoke", "mina@example.com").then(onAnswer)}>
        revoke
      </button>
      <button onClick={() => void askToConfirm("resend", "mina@example.com").then(onAnswer)}>
        resend
      </button>
      {confirmDialog}
    </>
  );
}

describe("useInvitationActionConfirm", () => {
  it("resolves false when the revoke is declined, so nothing happens", async () => {
    const user = userEvent.setup();
    const onAnswer = vi.fn();
    render(<Harness onAnswer={onAnswer} />);

    await user.click(screen.getByRole("button", { name: "revoke" }));

    expect(screen.getByText("Revoke Invitation?")).toBeInTheDocument();
    expect(onAnswer).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /cancel|keep/i }));

    expect(onAnswer).toHaveBeenCalledWith(false);
    expect(screen.queryByText("Revoke Invitation?")).not.toBeInTheDocument();
  });

  it("resolves true only once the revoke is confirmed", async () => {
    const user = userEvent.setup();
    const onAnswer = vi.fn();
    render(<Harness onAnswer={onAnswer} />);

    await user.click(screen.getByRole("button", { name: "revoke" }));
    await user.click(screen.getByRole("button", { name: "Revoke" }));

    expect(onAnswer).toHaveBeenCalledWith(true);
  });

  it("says revoking kills the link but leaves inviting them again open", async () => {
    const user = userEvent.setup();
    render(<Harness onAnswer={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "revoke" }));

    expect(screen.getByText(/mina@example.com/)).toBeInTheDocument();
    expect(screen.getByText(/invite link stops working right away/i)).toBeInTheDocument();
    expect(screen.getByText(/you can send them a new invitation/i)).toBeInTheDocument();
  });

  it("tells the invitee's holder that reissuing kills the link they already have", async () => {
    const user = userEvent.setup();
    render(<Harness onAnswer={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "resend" }));

    expect(screen.getByText("Reissue Invitation?")).toBeInTheDocument();
    expect(screen.getByText(/current link stops working immediately/i)).toBeInTheDocument();
  });
});
