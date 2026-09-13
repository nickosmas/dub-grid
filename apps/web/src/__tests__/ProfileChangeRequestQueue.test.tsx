import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProfileChangeRequestQueue } from "@/components/staff/ProfileChangeRequestQueue";
import {
  fetchPeopleProfileChangeRequests,
  requireCredentialAssurance,
  resolvePeopleProfileChangeRequest,
  type ProfileChangeRequest,
} from "@/features/account/client";
import type { Department, FocusArea, NamedItem } from "@/types";

const { mockToastError, mockToastSuccess } = vi.hoisted(() => ({
  mockToastError: vi.fn(),
  mockToastSuccess: vi.fn(),
}));
const stepUpRun = vi.hoisted(() => vi.fn());

vi.mock("sonner", () => ({
  toast: {
    error: mockToastError,
    success: mockToastSuccess,
  },
}));
vi.mock("@/hooks/useStepUpAction", () => ({
  useStepUpAction: () => ({ run: stepUpRun, dialog: null }),
}));

vi.mock("@/features/account/client", () => ({
  fetchPeopleProfileChangeRequests: vi.fn(),
  requireCredentialAssurance: vi.fn(),
  resolvePeopleProfileChangeRequest: vi.fn(),
}));

const focusAreas: FocusArea[] = [
  {
    id: 1,
    orgId: "org-1",
    name: "North",
    sortOrder: 1,
    departmentId: null,
  },
  {
    id: 2,
    orgId: "org-1",
    name: "South",
    sortOrder: 2,
    departmentId: null,
  },
];

const certifications: NamedItem[] = [
  { id: 4, orgId: "org-1", name: "Staff", abbr: "STF", sortOrder: 1 },
  { id: 5, orgId: "org-1", name: "Lead", abbr: "LD", sortOrder: 2 },
];

const roles: NamedItem[] = [
  { id: 7, orgId: "org-1", name: "Coordinator", abbr: "COORD", sortOrder: 1 },
];

const departments: Department[] = [
  {
    id: 10,
    orgId: "org-1",
    name: "Residential",
    abbr: "RES",
    type: "scheduled",
    sortOrder: 1,
    archivedAt: null,
  },
];

function makeRequest(overrides: Partial<ProfileChangeRequest> = {}): ProfileChangeRequest {
  return {
    id: "request-1",
    orgId: "org-1",
    requesterUserId: "user-1",
    requesterEmployeeId: "emp-1",
    requesterEmployeeVersion: 3,
    requesterName: "Alice Smith",
    requesterEmail: "alice@example.com",
    type: "profile_update",
    status: "pending",
    requestedChanges: {
      firstName: "Alicia",
      employmentType: "part_time",
      certificationId: 5,
      focusAreaIds: [2],
      roleIds: [7],
      departmentIds: [10],
    },
    currentValues: {
      firstName: "Alice",
      employmentType: "full_time",
      certificationId: 4,
      focusAreaIds: [1],
      roleIds: [],
      departmentIds: [],
    },
    requestNote: "Please update my work profile.",
    resolverUserId: null,
    resolverNote: "",
    resolvedAt: null,
    cancelledAt: null,
    createdAt: "2026-04-30T18:00:00.000Z",
    updatedAt: "2026-04-30T18:05:00.000Z",
    version: 1,
    ...overrides,
  };
}

function renderQueue() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ProfileChangeRequestQueue
        orgId="org-1"
        focusAreas={focusAreas}
        certifications={certifications}
        roles={roles}
        departments={departments}
      />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  stepUpRun.mockImplementation(async (action: (token: string) => Promise<unknown>) => {
    await action("fresh-token");
    return true;
  });
  vi.mocked(requireCredentialAssurance).mockResolvedValue({ success: true });
  vi.mocked(resolvePeopleProfileChangeRequest).mockResolvedValue({
    success: true,
    request: makeRequest({ status: "approved" }),
  });
});

describe("ProfileChangeRequestQueue", () => {
  it("shows detailed current and requested values for profile updates", async () => {
    vi.mocked(fetchPeopleProfileChangeRequests).mockResolvedValue({
      requests: [makeRequest()],
    });

    renderQueue();

    expect(await screen.findByText("Profile update")).toBeInTheDocument();
    expect(screen.getByText("Requester email")).toBeInTheDocument();
    expect(screen.getByText("alice@example.com")).toBeInTheDocument();
    expect(screen.queryByText("Employee version at request")).not.toBeInTheDocument();
    expect(screen.queryByText("Request version")).not.toBeInTheDocument();
    expect(screen.queryByText("Request ID")).not.toBeInTheDocument();
    expect(screen.queryByText("Requester user ID")).not.toBeInTheDocument();
    expect(screen.queryByText("Employee ID")).not.toBeInTheDocument();
    expect(screen.getByText("Current")).toBeInTheDocument();
    expect(screen.getByText("Requested")).toBeInTheDocument();
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("Alicia")).toBeInTheDocument();
    expect(screen.getByText("Full-time")).toBeInTheDocument();
    expect(screen.getByText("Part-time")).toBeInTheDocument();
    expect(screen.getByText("North")).toBeInTheDocument();
    expect(screen.getByText("South")).toBeInTheDocument();
    expect(screen.getByText("Staff")).toBeInTheDocument();
    expect(screen.getByText("Lead")).toBeInTheDocument();
    expect(screen.getByText("Coordinator")).toBeInTheDocument();
    expect(screen.getByText("Residential")).toBeInTheDocument();
    expect(screen.getByText("Please update my work profile.")).toBeInTheDocument();
  });

  it("shows account deletion warning and account snapshots", async () => {
    vi.mocked(fetchPeopleProfileChangeRequests).mockResolvedValue({
      requests: [
        makeRequest({
          type: "account_deletion",
          requestedChanges: {},
          currentValues: {},
          requestNote: "",
        }),
      ],
    });

    renderQueue();

    expect(await screen.findByText("Account deletion")).toBeInTheDocument();
    expect(screen.getByText("Account deletion request")).toBeInTheDocument();
    expect(
      screen.getByText(/approving will permanently delete this user's account/i),
    ).toBeInTheDocument();
    expect(screen.queryByText("Requester user ID")).not.toBeInTheDocument();
    expect(screen.queryByText("Linked employee ID")).not.toBeInTheDocument();
    expect(screen.queryByText("Request ID")).not.toBeInTheDocument();

    await waitFor(() => {
      expect(fetchPeopleProfileChangeRequests).toHaveBeenCalledWith("org-1", "pending");
    });
  });

  it("requires fresh assurance only when approving account deletion", async () => {
    vi.mocked(fetchPeopleProfileChangeRequests).mockResolvedValue({
      requests: [makeRequest({ type: "account_deletion", requestedChanges: {} })],
    });
    renderQueue();

    fireEvent.click(await screen.findByRole("button", { name: "Approve" }));
    const dialog = screen.getByRole("dialog", { name: "Approve Account deletion?" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Approve" }));

    await waitFor(() => expect(resolvePeopleProfileChangeRequest).toHaveBeenCalledOnce());
    expect(requireCredentialAssurance).toHaveBeenCalledWith("fresh-token");
    expect(resolvePeopleProfileChangeRequest).toHaveBeenCalledWith({
      orgId: "org-1",
      requestId: "request-1",
      action: "approve",
      accessToken: "fresh-token",
    });
  });

  it("does not require step-up when rejecting an account deletion request", async () => {
    vi.mocked(fetchPeopleProfileChangeRequests).mockResolvedValue({
      requests: [makeRequest({ type: "account_deletion", requestedChanges: {} })],
    });
    renderQueue();

    fireEvent.click(await screen.findByRole("button", { name: "Reject" }));
    fireEvent.click(
      within(screen.getByRole("dialog", { name: "Reject Account deletion?" })).getByRole("button", {
        name: "Reject",
      }),
    );

    await waitFor(() => expect(resolvePeopleProfileChangeRequest).toHaveBeenCalledOnce());
    expect(stepUpRun).not.toHaveBeenCalled();
    expect(requireCredentialAssurance).not.toHaveBeenCalled();
  });
});
