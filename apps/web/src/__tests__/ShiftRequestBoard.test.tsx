import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import ShiftRequestBoard from "@/components/ShiftRequestBoard";
import type { ShiftRequest } from "@/types";

function makeRequest(overrides: Partial<ShiftRequest> = {}): ShiftRequest {
  return {
    id: "req-1",
    orgId: "org-1",
    type: "pickup",
    status: "open",
    requesterEmpId: "emp-1",
    requesterName: "Alice Smith",
    requesterShiftDate: "2026-04-16",
    requesterState: {
      kind: "worked",
      segments: [{ shiftId: 1, jobId: 1, position: 0 }],
      absenceTypeId: null,
      customStartTime: null,
      customEndTime: null,
      seriesId: null,
      fromRecurring: false,
    },
    requesterAssignmentDefinitionIds: [1],
    requesterShiftLabel: "Day",
    requesterFocusAreaId: 10,
    requesterCustomStartTime: null,
    requesterCustomEndTime: null,
    targetEmpId: null,
    targetName: null,
    targetShiftDate: null,
    targetAssignmentDefinitionIds: null,
    targetShiftLabel: null,
    targetFocusAreaId: null,
    targetCustomStartTime: null,
    targetCustomEndTime: null,
    absenceTypeId: null,
    parentRequestId: null,
    adminUserId: null,
    adminNote: null,
    expiresAt: "2099-04-17T12:00:00.000Z",
    resolvedAt: null,
    createdAt: "2026-04-16T08:00:00.000Z",
    updatedAt: "2026-04-16T08:00:00.000Z",
    ...overrides,
  };
}

function renderBoard({
  openPickups = [],
  myRequests = [],
  pendingApproval = [],
  approvalQueue,
  currentEmpId = "emp-2",
  canApprove = false,
}: {
  openPickups?: ShiftRequest[];
  myRequests?: ShiftRequest[];
  pendingApproval?: ShiftRequest[];
  approvalQueue?: ShiftRequest[];
  currentEmpId?: string | null;
  canApprove?: boolean;
} = {}) {
  const onClaim = vi.fn();
  const onRespond = vi.fn();
  const onResolve = vi.fn();
  const onCancel = vi.fn();

  render(
    <ShiftRequestBoard
      openPickups={openPickups}
      myRequests={myRequests}
      pendingApproval={pendingApproval}
      approvalQueue={approvalQueue}
      loading={false}
      currentEmpId={currentEmpId}
      canApprove={canApprove}
      onClaim={onClaim}
      onRespond={onRespond}
      onResolve={onResolve}
      onCancel={onCancel}
      onClose={vi.fn()}
    />,
  );

  return { onClaim, onRespond, onResolve, onCancel };
}

describe("ShiftRequestBoard", () => {
  it("claims an available open pickup", async () => {
    const user = userEvent.setup();
    const request = makeRequest();
    const { onClaim } = renderBoard({ openPickups: [request] });

    await user.click(screen.getByRole("button", { name: "Claim" }));

    expect(onClaim).toHaveBeenCalledWith("req-1");
  });

  it("lets the targeted employee accept or decline a swap request", async () => {
    const user = userEvent.setup();
    const request = makeRequest({
      id: "swap-1",
      type: "swap",
      requesterEmpId: "emp-1",
      requesterName: "Alice Smith",
      targetEmpId: "emp-2",
      targetName: "Bob Jones",
      targetShiftDate: "2026-04-17",
      targetAssignmentDefinitionIds: [2],
      targetShiftLabel: "Night",
      status: "open",
    });
    const { onRespond } = renderBoard({
      myRequests: [request],
      currentEmpId: "emp-2",
    });

    await user.click(screen.getByRole("button", { name: /my requests/i }));
    await user.click(screen.getByRole("button", { name: "Accept" }));
    await user.click(screen.getByRole("button", { name: "Decline" }));

    expect(onRespond).toHaveBeenNthCalledWith(1, "swap-1", true);
    expect(onRespond).toHaveBeenNthCalledWith(2, "swap-1", false);
  });

  it("lets approvers approve or reject pending requests with a note", async () => {
    const user = userEvent.setup();
    const request = makeRequest({
      id: "approve-1",
      type: "calloff",
      status: "pending_approval",
    });
    const { onResolve } = renderBoard({
      pendingApproval: [request],
      canApprove: true,
      currentEmpId: "manager-1",
    });

    await user.click(screen.getByRole("button", { name: /approval queue/i }));
    await user.click(screen.getByRole("button", { name: "Approve" }));
    await user.click(screen.getByRole("button", { name: "Reject" }));
    await user.type(screen.getByPlaceholderText("Optional note..."), "Need more coverage");
    await user.click(screen.getByRole("button", { name: "Confirm Reject" }));

    expect(onResolve).toHaveBeenNthCalledWith(1, "approve-1", true);
    expect(onResolve).toHaveBeenNthCalledWith(2, "approve-1", false, "Need more coverage");
  });

  it("shows open requests in the approval queue for approvers", async () => {
    const user = userEvent.setup();
    const request = makeRequest({
      id: "swap-open-1",
      type: "swap",
      status: "open",
      targetEmpId: "emp-9",
      targetName: "Bob Jones",
      targetShiftDate: "2026-04-17",
      targetAssignmentDefinitionIds: [2],
      targetShiftLabel: "Night",
    });

    renderBoard({
      approvalQueue: [request],
      canApprove: true,
      currentEmpId: "manager-1",
    });

    await user.click(screen.getByRole("button", { name: /approval queue/i }));

    expect(screen.getByText("Alice Smith")).toBeInTheDocument();
    expect(screen.getByText("Open")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Approve" })).not.toBeInTheDocument();
  });

  it("lets a requester cancel their own open request", async () => {
    const user = userEvent.setup();
    const request = makeRequest({
      id: "mine-1",
      requesterEmpId: "emp-2",
    });
    const { onCancel } = renderBoard({
      myRequests: [request],
      currentEmpId: "emp-2",
    });

    await user.click(screen.getByRole("button", { name: /my requests/i }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onCancel).toHaveBeenCalledWith("mine-1");
  });
});
