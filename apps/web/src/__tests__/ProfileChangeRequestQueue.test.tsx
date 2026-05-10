import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProfileChangeRequestQueue } from "@/components/staff/ProfileChangeRequestQueue";
import {
  fetchPeopleProfileChangeRequests,
  resolvePeopleProfileChangeRequest,
  type ProfileChangeRequest,
} from "@/features/account/client";
import type { Department, FocusArea, NamedItem } from "@/types";

const { mockToastError, mockToastSuccess } = vi.hoisted(() => ({
  mockToastError: vi.fn(),
  mockToastSuccess: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    error: mockToastError,
    success: mockToastSuccess,
  },
}));

vi.mock("@/features/account/client", () => ({
  fetchPeopleProfileChangeRequests: vi.fn(),
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
  return render(
    <ProfileChangeRequestQueue
      orgId="org-1"
      focusAreas={focusAreas}
      certifications={certifications}
      roles={roles}
      departments={departments}
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
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

  it("shows account deletion safeguards and account snapshots", async () => {
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
      screen.getByText(/approval will run the account deletion safeguards/i),
    ).toBeInTheDocument();
    expect(screen.queryByText("Requester user ID")).not.toBeInTheDocument();
    expect(screen.queryByText("Linked employee ID")).not.toBeInTheDocument();
    expect(screen.queryByText("Request ID")).not.toBeInTheDocument();

    await waitFor(() => {
      expect(fetchPeopleProfileChangeRequests).toHaveBeenCalledWith("org-1", "pending");
    });
  });
});
