import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EmployeeActivityEntry } from "@/types";
import type { GridmasterPersonRecord } from "@/features/gridmaster/person-record";
import {
  exportGridmasterPersonHistory,
  fetchGridmasterPersonHistory,
} from "@/features/gridmaster/client";
import { PersonHistoryCard } from "./PersonHistoryCard";

const stepUpRun = vi.fn();
const requireCredentialAssurance = vi.fn();

vi.mock("@/features/gridmaster/client", () => ({
  fetchGridmasterPersonHistory: vi.fn(),
  exportGridmasterPersonHistory: vi.fn(),
}));
vi.mock("@/hooks/useStepUpAction", () => ({
  useStepUpAction: () => ({ run: stepUpRun, dialog: null }),
}));
vi.mock("@/features/account/client", () => ({
  requireCredentialAssurance: (token: string) => requireCredentialAssurance(token),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function entry(
  overrides: Partial<EmployeeActivityEntry> & { id: string; action: string },
): EmployeeActivityEntry {
  return {
    orgId: "org-1",
    orgName: "Calm Haven",
    actorId: "admin-1",
    actorEmail: "alex@example.com",
    actorName: "Alex Admin",
    resourceType: "user",
    resourceId: "user-1",
    targetLabel: "Sam Rivera",
    targetEmail: "sam@example.com",
    details: {},
    createdAt: "2026-01-03T10:00:00.000Z",
    ...overrides,
  };
}

const ROLE_CHANGE = entry({
  id: "role-1",
  action: "role.changed",
  details: { fromRole: "user", toRole: "admin" },
});
const IMPERSONATION = entry({
  id: "impersonation-s-1",
  action: "impersonation.session",
  orgId: "org-2",
  orgName: "Arbor View",
  details: { durationMinutes: 12, justification: "Ticket 42" },
  createdAt: "2026-01-02T10:00:00.000Z",
});
const RESET = entry({
  id: "reset-1",
  action: "user.mfa_reset",
  orgId: null,
  orgName: null,
  createdAt: "2026-01-01T10:00:00.000Z",
});

const record = {
  organizations: [
    { org: { id: "org-1", name: "Calm Haven", slug: "calmhaven" } },
    { org: { id: "org-2", name: "Arbor View", slug: "arborview" } },
  ],
} as unknown as GridmasterPersonRecord;

function renderCard() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <PersonHistoryCard target={{ kind: "user", userId: "user-1" }} record={record} />
    </QueryClientProvider>,
  );
}

function rows() {
  return screen.queryAllByRole("row", { name: /Open details/ });
}

describe("PersonHistoryCard", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-01-05T12:00:00.000Z"));
    vi.mocked(fetchGridmasterPersonHistory).mockReset();
    vi.mocked(exportGridmasterPersonHistory).mockReset();
    stepUpRun.mockReset();
  });
  afterEach(() => vi.useRealTimers());

  it("fetches nothing until opened, then lists the history by day", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    vi.mocked(fetchGridmasterPersonHistory).mockResolvedValue({
      entries: [ROLE_CHANGE, IMPERSONATION, RESET],
      truncated: false,
    });
    renderCard();

    expect(fetchGridmasterPersonHistory).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Show history" }));

    expect(fetchGridmasterPersonHistory).toHaveBeenCalledWith({ kind: "user", userId: "user-1" });
    expect(
      await screen.findByText(/Viewed the app as Sam Rivera for 12 minutes/),
    ).toBeInTheDocument();
    expect(rows()).toHaveLength(3);
  });

  it("narrows by category and by organization", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    vi.mocked(fetchGridmasterPersonHistory).mockResolvedValue({
      entries: [ROLE_CHANGE, IMPERSONATION, RESET],
      truncated: false,
    });
    renderCard();
    await user.click(screen.getByRole("button", { name: "Show history" }));
    await screen.findByText(/Viewed the app as/);

    await user.click(screen.getByRole("button", { name: "Filter by activity type" }));
    await user.click(
      within(screen.getByRole("listbox")).getByRole("option", { name: "Impersonation" }),
    );
    expect(rows()).toHaveLength(1);

    await user.click(screen.getByRole("button", { name: "Filter by activity type" }));
    await user.click(
      within(screen.getByRole("listbox")).getByRole("option", { name: "All activity" }),
    );

    await user.click(screen.getByRole("button", { name: "Filter by organization" }));
    await user.click(
      within(screen.getByRole("listbox")).getByRole("option", {
        name: "Platform (no organization)",
      }),
    );
    expect(rows()).toHaveLength(1);
  });

  it("warns when the history is partial", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    vi.mocked(fetchGridmasterPersonHistory).mockResolvedValue({
      entries: [ROLE_CHANGE],
      truncated: true,
    });
    renderCard();
    await user.click(screen.getByRole("button", { name: "Show history" }));

    expect(await screen.findByText(/This history is partial/)).toBeInTheDocument();
  });

  it("shows the error and loads again on retry", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    vi.mocked(fetchGridmasterPersonHistory)
      .mockRejectedValueOnce(new Error("We couldn't load this history."))
      .mockResolvedValueOnce({ entries: [], truncated: false });
    renderCard();
    await user.click(screen.getByRole("button", { name: "Show history" }));

    expect(await screen.findByText("We couldn't load this history.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(
      await screen.findByText("Nothing has been recorded by or about this person yet."),
    ).toBeInTheDocument();
  });

  describe("export", () => {
    let createObjectURL: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      vi.mocked(fetchGridmasterPersonHistory).mockResolvedValue({
        entries: [ROLE_CHANGE],
        truncated: false,
      });
      vi.mocked(exportGridmasterPersonHistory).mockResolvedValue({
        entries: [ROLE_CHANGE],
        truncated: false,
        rowCount: 1,
        exportedAt: "2026-01-05T12:00:00.000Z",
      });
      requireCredentialAssurance.mockResolvedValue(undefined);
      createObjectURL = vi.fn(() => "blob:history");
      Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() });
    });

    async function openAndConfirm() {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      renderCard();
      await user.click(screen.getByRole("button", { name: "Show history" }));
      await user.click(await screen.findByRole("button", { name: "Export history" }));
      await user.click(screen.getByRole("button", { name: "Export" }));
    }

    it("exports through step-up after the credential check", async () => {
      stepUpRun.mockImplementation(async (action: (token: string) => Promise<void>) =>
        action("assured-token"),
      );
      await openAndConfirm();

      await vi.waitFor(() => expect(createObjectURL).toHaveBeenCalledTimes(1));
      expect(requireCredentialAssurance).toHaveBeenCalledWith("assured-token");
      expect(exportGridmasterPersonHistory).toHaveBeenCalledWith(
        { kind: "user", userId: "user-1" },
        "assured-token",
      );
    });

    it("downloads nothing when step-up is cancelled", async () => {
      stepUpRun.mockResolvedValue(undefined);
      await openAndConfirm();

      await vi.waitFor(() => expect(stepUpRun).toHaveBeenCalledTimes(1));
      expect(exportGridmasterPersonHistory).not.toHaveBeenCalled();
      expect(createObjectURL).not.toHaveBeenCalled();
    });
  });
});
