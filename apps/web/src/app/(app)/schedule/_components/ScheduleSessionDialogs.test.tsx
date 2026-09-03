import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  ScheduleSessionConflictDialog,
  ScheduleSessionEndedDialog,
} from "./ScheduleSessionDialogs";

describe("ScheduleSessionDialogs", () => {
  it("explains the narrow takeover scope and exposes the three safe choices", async () => {
    const useThisTab = vi.fn().mockResolvedValue(undefined);
    const cancel = vi.fn();
    const signOut = vi.fn();
    render(
      <ScheduleSessionConflictDialog
        onUseThisTab={useThisTab}
        onCancel={cancel}
        onSignOutThisDevice={signOut}
      />,
    );

    expect(screen.getByRole("dialog", { name: "Open in another tab or device" })).toBeTruthy();
    expect(screen.getByText(/other tab or device stays signed in/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Sign out this device" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Use this tab" }));
    });

    expect(useThisTab).toHaveBeenCalledTimes(1);
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it("warns the ended editor that unsaved work was not saved", () => {
    render(<ScheduleSessionEndedDialog onClose={vi.fn()} />);

    expect(screen.getByText(/unsaved changes in this tab were not saved/i)).toBeTruthy();
  });
});
