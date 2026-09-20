import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
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
  canViewAllRequests = false,
}: {
  openPickups?: ShiftRequest[];
  myRequests?: ShiftRequest[];
  pendingApproval?: ShiftRequest[];
  approvalQueue?: ShiftRequest[];
  currentEmpId?: string | null;
  canApprove?: boolean;
  canViewAllRequests?: boolean;
} = {}) {
  const onClaim = vi.fn();
  const onRespond = vi.fn();
  const onResolve = vi.fn();
  const onCancel = vi.fn();

  render(
    <ShiftRequestBoard
      orgId="org-1"
      openPickups={openPickups}
      myRequests={myRequests}
      pendingApproval={pendingApproval}
      approvalQueue={approvalQueue}
      canViewAllRequests={canViewAllRequests}
      loading={false}
      currentEmpId={currentEmpId}
      canApprove={canApprove}
      onClaim={onClaim}
      onRespond={onRespond}
      onResolve={onResolve}
      onCancel={onCancel}
      onClose={vi.fn()}
      assignmentNameMap={new Map()}
    />,
    {
      wrapper: ({ children }) => (
        <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
      ),
    },
  );

  return { onClaim, onRespond, onResolve, onCancel };
}

async function confirmDialogAction(user: ReturnType<typeof userEvent.setup>, label: string) {
  const buttons = screen.getAllByRole("button", { name: label });
  await user.click(buttons[buttons.length - 1]);
}

describe("ShiftRequestBoard", () => {
  it("spells out shift and job names from segments instead of the grid abbreviation", () => {
    const request = makeRequest({
      requesterShiftLabel: "D RN",
      requesterSegments: [
        {
          shiftId: 1,
          jobId: 1,
          label: "D RN",
          shiftName: "Day Shift",
          jobName: "Registered Nurse",
          showJobOnGrid: true,
        },
      ],
    });
    renderBoard({ openPickups: [request] });

    // The panel names the shift and its job together, never the grid abbreviation.
    expect(screen.getByText("Day Shift · Registered Nurse")).toBeInTheDocument();
    expect(screen.queryByText(/D RN/)).not.toBeInTheDocument();
  });

  it("falls back to the abbreviated label when a request has no resolvable segments", () => {
    const request = makeRequest({ requesterShiftLabel: "Day", requesterSegments: [] });
    renderBoard({ openPickups: [request] });

    expect(screen.getByText("Day")).toBeInTheDocument();
  });

  it("falls back to the abbreviated label when segments came back without names", () => {
    const request = makeRequest({
      requesterShiftLabel: "D · M",
      requesterSegments: [
        {
          shiftId: 34,
          jobId: 20,
          label: "",
          shiftName: null,
          jobName: null,
          showJobOnGrid: true,
        },
      ],
    });
    renderBoard({ openPickups: [request] });

    expect(screen.getByText("D · M")).toBeInTheDocument();
    expect(screen.queryByText("?")).not.toBeInTheDocument();
  });

  it("claims an available open pickup", async () => {
    const user = userEvent.setup();
    const request = makeRequest();
    const { onClaim } = renderBoard({ openPickups: [request] });

    await user.click(screen.getByRole("button", { name: "Claim" }));
    expect(onClaim).not.toHaveBeenCalled();
    expect(screen.getByText("Claim this shift?")).toBeInTheDocument();
    await confirmDialogAction(user, "Claim");

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
    expect(
      screen
        .getAllByRole("button")
        .map((button) => button.textContent)
        .filter((label) => label === "Accept" || label === "Decline"),
    ).toEqual(["Decline", "Accept"]);
    await user.click(screen.getByRole("button", { name: "Accept" }));
    await confirmDialogAction(user, "Accept");
    await user.click(screen.getByRole("button", { name: "Decline" }));
    await confirmDialogAction(user, "Decline");

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
    expect(
      screen
        .getAllByRole("button")
        .map((button) => button.textContent)
        .filter((label) => label === "Approve" || label === "Reject"),
    ).toEqual(["Reject", "Approve"]);
    // The one note field serves both decisions: typed once, it rides along
    // with whichever button is pressed, and clears after the decision lands.
    await user.type(
      screen.getByPlaceholderText(/^Note to .*\? \(Optional\)$/),
      "Thanks for asking",
    );
    await user.click(screen.getByRole("button", { name: "Approve" }));
    await confirmDialogAction(user, "Approve");
    await user.type(
      screen.getByPlaceholderText(/^Note to .*\? \(Optional\)$/),
      "Need more coverage",
    );
    await user.click(screen.getByRole("button", { name: "Reject" }));
    await confirmDialogAction(user, "Reject");

    expect(onResolve).toHaveBeenNthCalledWith(1, "approve-1", true, "Thanks for asking");
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
    expect(screen.getByText("Swap request")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Approve" })).not.toBeInTheDocument();
  });

  it("shows the full request queue for schedule editors without approval permission", async () => {
    const user = userEvent.setup();
    const request = makeRequest({
      id: "swap-open-2",
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
      canApprove: false,
      canViewAllRequests: true,
      currentEmpId: "editor-1",
    });

    await user.click(screen.getByRole("button", { name: /all requests/i }));

    expect(screen.getByText("Alice Smith")).toBeInTheDocument();
    expect(screen.getByText("Swap request")).toBeInTheDocument();
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
    await confirmDialogAction(user, "Cancel request");

    expect(onCancel).toHaveBeenCalledWith("mine-1");
  });
});
