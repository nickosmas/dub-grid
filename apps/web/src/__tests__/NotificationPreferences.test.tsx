import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NotificationPreferences } from "@/components/profile/NotificationPreferences";

const mockFetchNotificationPreferences = vi.fn();
const mockSaveNotificationPreferences = vi.fn();

vi.mock("@/components/AuthProvider", () => ({
  useAuth: () => ({
    user: { id: "user-1" },
    isLoading: false,
  }),
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

    const [scheduleInApp] = screen.getAllByRole("checkbox");
    fireEvent.click(scheduleInApp);
    await waitFor(() => {
      expect(saveButton).toBeEnabled();
    });

    await user.click(saveButton);

    await waitFor(() => {
      expect(saveButton).toBeDisabled();
    });
  });

  it("centers the notification channel headers over the checkbox columns", async () => {
    render(<NotificationPreferences />);

    const inAppHeader = await screen.findByLabelText("In-App");
    const emailHeader = screen.getByLabelText("Email");

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
});
