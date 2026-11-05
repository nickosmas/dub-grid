import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RequestDeletionCard } from "./RequestDeletionCard";

const fetchOwnProfileChangeRequests = vi.fn();
const createOwnProfileChangeRequest = vi.fn();
const cancelOwnProfileChangeRequest = vi.fn();

vi.mock("@/features/account/client", () => ({
  fetchOwnProfileChangeRequests: (...args: unknown[]) => fetchOwnProfileChangeRequests(...args),
  createOwnProfileChangeRequest: (...args: unknown[]) => createOwnProfileChangeRequest(...args),
  cancelOwnProfileChangeRequest: (...args: unknown[]) => cancelOwnProfileChangeRequest(...args),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const PENDING = { id: "r1", type: "account_deletion", status: "pending" };

describe("RequestDeletionCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchOwnProfileChangeRequests.mockResolvedValue({ requests: [] });
  });

  it("asks first, then sends the request and offers to cancel it", async () => {
    createOwnProfileChangeRequest.mockResolvedValue({ request: PENDING });
    render(<RequestDeletionCard orgId="org-1" isOrgMember />);

    fireEvent.click(await screen.findByRole("button", { name: "Request account deletion" }));
    fireEvent.click(await screen.findByRole("button", { name: "Request deletion" }));

    await waitFor(() =>
      expect(createOwnProfileChangeRequest).toHaveBeenCalledWith(
        expect.objectContaining({ orgId: "org-1", type: "account_deletion" }),
      ),
    );
    expect(await screen.findByRole("button", { name: "Cancel request" })).toBeInTheDocument();
  });

  it("shows a request already waiting, and cancels it", async () => {
    fetchOwnProfileChangeRequests.mockResolvedValue({ requests: [PENDING] });
    cancelOwnProfileChangeRequest.mockResolvedValue({
      request: { ...PENDING, status: "canceled" },
    });
    render(<RequestDeletionCard orgId="org-1" isOrgMember />);

    fireEvent.click(await screen.findByRole("button", { name: "Cancel request" }));

    await waitFor(() => expect(cancelOwnProfileChangeRequest).toHaveBeenCalledWith("r1"));
    expect(
      await screen.findByRole("button", { name: "Request account deletion" }),
    ).toBeInTheDocument();
  });

  it("doesn't ask a non-member's organization for requests", async () => {
    render(<RequestDeletionCard orgId="org-1" isOrgMember={false} />);

    expect(await screen.findByRole("button", { name: "Request account deletion" })).toBeEnabled();
    expect(fetchOwnProfileChangeRequests).not.toHaveBeenCalled();
  });
});
