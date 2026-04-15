import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NotificationPreferences } from "@/components/profile/NotificationPreferences";
import { supabase } from "@/lib/supabase";
import { getVerifiedBrowserUser } from "@/lib/browser-auth";

vi.mock("@/lib/browser-auth", () => ({
  getVerifiedBrowserUser: vi.fn(),
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

    vi.mocked(getVerifiedBrowserUser).mockResolvedValue({
      id: "user-1",
    } as Awaited<ReturnType<typeof getVerifiedBrowserUser>>);

    vi.mocked(supabase.from).mockImplementation(() => {
      const builder = {
        select: vi.fn(),
        eq: vi.fn(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: {
            prefs: {
              schedule: { in_app: true, email: false },
              shift_requests: { in_app: true, email: false },
              system: { in_app: true, email: false },
            },
          },
        }),
        upsert: vi.fn().mockResolvedValue({ error: null }),
      };

      builder.select.mockReturnValue(builder);
      builder.eq.mockReturnValue(builder);
      return builder as unknown as ReturnType<typeof supabase.from>;
    });
  });

  it("keeps Save Preferences disabled until preferences change, then disables again after save", async () => {
    const user = userEvent.setup();

    render(<NotificationPreferences />);

    const saveButton = await screen.findByRole("button", { name: /save preferences/i });
    expect(saveButton).toBeDisabled();

    const [scheduleInApp] = screen.getAllByRole("checkbox");
    await user.click(scheduleInApp);
    expect(saveButton).toBeEnabled();

    await user.click(saveButton);

    await waitFor(() => {
      expect(saveButton).toBeDisabled();
    });
  });
});
