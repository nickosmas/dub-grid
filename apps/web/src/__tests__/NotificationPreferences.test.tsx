import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NotificationPreferences } from "@/components/profile/NotificationPreferences";
import { NotificationsPanel } from "@/components/account/NotificationsPanel";

const mockFetchNotificationPreferences = vi.fn();
const mockSaveNotificationPreferences = vi.fn();

// One object for every render, as the real provider gives: a fresh user each
// render re-runs the load effect and resets unsaved changes.
const authState = vi.hoisted(() => ({ user: { id: "user-1" }, isLoading: false }));
vi.mock("@/components/AuthProvider", () => ({
  useAuth: () => authState,
}));

vi.mock("@/features/account/client", () => ({
  fetchNotificationPreferences: (...args: unknown[]) => mockFetchNotificationPreferences(...args),
  saveNotificationPreferences: (...args: unknown[]) => mockSaveNotificationPreferences(...args),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe("NotificationPreferences", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchNotificationPreferences.mockResolvedValue({
      prefs: {
        schedule: { in_app: true, email: false },
        shift_requests: { in_app: true, email: false },
        system: { in_app: true, email: false },
      },
    });
    mockSaveNotificationPreferences.mockResolvedValue({
      prefs: {
        schedule: { in_app: false, email: false },
        shift_requests: { in_app: true, email: false },
        system: { in_app: true, email: false },
      },
    });
  });

  it("keeps Save Preferences disabled until preferences change, then disables again after save", async () => {
    const user = userEvent.setup();

    render(<NotificationPreferences />);

    const saveButton = await screen.findByRole("button", { name: /save preferences/i });
    expect(saveButton).toBeDisabled();

    const [scheduleInApp] = screen.getAllByRole("switch");
    fireEvent.click(scheduleInApp);
    await waitFor(() => {
      expect(saveButton).toBeEnabled();
    });

    await user.click(saveButton);

    await waitFor(() => {
      expect(saveButton).toBeDisabled();
    });
  });

  it("shows security alerts as always on and never saves a preference for them", async () => {
    const user = userEvent.setup();
    mockFetchNotificationPreferences.mockResolvedValueOnce({
      prefs: {
        schedule: { in_app: true, email: false },
        shift_requests: { in_app: true, email: false },
        system: { in_app: true, email: false },
        security: { in_app: false, email: false },
      },
    });

    render(<NotificationPreferences />);

    expect(await screen.findByText("Always on")).toBeInTheDocument();
    expect(screen.queryByRole("switch", { name: /security alerts/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("switch")[0]);
    const saveButton = screen.getByRole("button", { name: /save preferences/i });
    await waitFor(() => expect(saveButton).toBeEnabled());
    await user.click(saveButton);

    await waitFor(() => expect(mockSaveNotificationPreferences).toHaveBeenCalledOnce());
    const saved = mockSaveNotificationPreferences.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(saved).not.toHaveProperty("security");
    expect(saved).toHaveProperty("membership");
  });

  it("shows a layout skeleton while notification preferences load", () => {
    mockFetchNotificationPreferences.mockReturnValue(new Promise(() => {}));

    render(<NotificationPreferences />);

    const skeleton = screen.getByRole("status", { name: /loading notification preferences/i });
    expect(skeleton).toBeInTheDocument();
    expect(skeleton.querySelectorAll(".dg-skeleton").length).toBeGreaterThan(0);
  });

  it("centers the notification channel headers over the checkbox columns", async () => {
    render(<NotificationPreferences />);

    const inAppHeader = (await screen.findByText("In-App")).parentElement;
    const emailHeader = screen.getByText("Email").parentElement;

    expect(inAppHeader).toHaveStyle({
      display: "flex",
      justifyContent: "center",
      width: "100%",
    });
    expect(emailHeader).toHaveStyle({
      display: "flex",
      justifyContent: "center",
      width: "100%",
    });
  });

  it("hides Billing & Payments from non-super-admins", async () => {
    render(<NotificationsPanel isGridmaster={false} isSuperAdmin={false} />);

    await screen.findByText("Schedule Changes");
    expect(screen.queryByText("Billing & Payments")).not.toBeInTheDocument();
    expect(screen.getByText("Security Alerts")).toBeInTheDocument();
    expect(screen.getByText("System Notifications")).toBeInTheDocument();
  });

  it("shows Billing & Payments to super_admins", async () => {
    render(<NotificationsPanel isGridmaster={false} isSuperAdmin={true} />);

    await screen.findByText("Schedule Changes");
    expect(screen.getByText("Billing & Payments")).toBeInTheDocument();
  });

  it("shows only the system category to gridmasters", async () => {
    render(<NotificationsPanel isGridmaster={true} isSuperAdmin={false} />);

    await screen.findByText("System Notifications");
    expect(screen.queryByText("Schedule Changes")).not.toBeInTheDocument();
    expect(screen.queryByText("Billing & Payments")).not.toBeInTheDocument();
  });
});
