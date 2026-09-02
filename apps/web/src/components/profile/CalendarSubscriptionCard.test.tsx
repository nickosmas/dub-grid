import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchStatus = vi.fn();
const createSubscription = vi.fn();
const rotateSubscription = vi.fn();
const revokeSubscription = vi.fn();

vi.mock("@/features/account/client/api", () => ({
  fetchCalendarSubscriptionStatus: () => fetchStatus(),
  createCalendarSubscription: () => createSubscription(),
  rotateCalendarSubscription: () => rotateSubscription(),
  revokeCalendarSubscription: () => revokeSubscription(),
}));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { CalendarSubscriptionCard } from "./CalendarSubscriptionCard";

const PRIVATE_URL = `https://calm.localhost/api/calendar/feed/${"A".repeat(43)}`;

beforeEach(() => {
  vi.clearAllMocks();
  fetchStatus.mockResolvedValue({ active: false, issuedAt: null });
  createSubscription.mockResolvedValue({
    active: true,
    issuedAt: "2026-09-01T00:00:00.000Z",
    feedUrl: PRIVATE_URL,
  });
  rotateSubscription.mockResolvedValue({
    active: true,
    issuedAt: "2026-09-02T00:00:00.000Z",
    feedUrl: `${PRIVATE_URL}-new`,
  });
  revokeSubscription.mockResolvedValue({ active: false, issuedAt: null });
  vi.spyOn(window, "confirm").mockReturnValue(true);
});

describe("CalendarSubscriptionCard", () => {
  it("creates and discloses a private link only after issuance", async () => {
    render(<CalendarSubscriptionCard />);

    const createButton = await screen.findByRole("button", { name: "Create private link" });
    expect(screen.queryByText(PRIVATE_URL)).not.toBeInTheDocument();
    fireEvent.click(createButton);

    expect(await screen.findByText(PRIVATE_URL)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy link" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Replace link" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Disable subscription" })).toBeInTheDocument();
  });

  it("does not redisclose an existing link after a fresh status load", async () => {
    fetchStatus.mockResolvedValue({
      active: true,
      issuedAt: "2026-09-01T00:00:00.000Z",
    });

    render(<CalendarSubscriptionCard />);

    expect(
      await screen.findByText(/its private link is shown only when created or replaced/i),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Copy link" })).not.toBeInTheDocument();
  });

  it("warns before replacement and disable, then reflects revocation", async () => {
    fetchStatus.mockResolvedValue({
      active: true,
      issuedAt: "2026-09-01T00:00:00.000Z",
    });
    render(<CalendarSubscriptionCard />);

    fireEvent.click(await screen.findByRole("button", { name: "Replace link" }));
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining("previous URL"));
    expect(await screen.findByText(`${PRIVATE_URL}-new`)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Disable subscription" }));
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining("stop receiving updates"));
    await waitFor(() => expect(revokeSubscription).toHaveBeenCalled());
    expect(await screen.findByRole("button", { name: "Create private link" })).toBeInTheDocument();
  });
});
