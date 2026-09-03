import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  ScheduleCellBusyDialog,
  ScheduleSessionConflictDialog,
  ScheduleSessionEndedDialog,
  ScheduleSessionWarning,
} from "./ScheduleSessionDialogs";

describe("ScheduleSessionDialogs", () => {
  it("keeps same-account sessions visible with narrow takeover and local sign-out actions", async () => {
    const endOtherSessions = vi.fn().mockResolvedValue(undefined);
    const signOut = vi.fn();
    render(
      <ScheduleSessionWarning
        sessionCount={2}
        onEndOtherSessions={endOtherSessions}
        onSignOutThisDevice={signOut}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("2 other tabs or devices");
    expect(screen.getByRole("alert").getAttribute("style")).toContain("var(--dg-color-danger-bg)");
    expect(screen.getByRole("alert").getAttribute("style")).toContain(
      "var(--dg-color-danger-border)",
    );
    expect(screen.getByText(/devices will stay signed in/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Sign out this device" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "End other schedule sessions" }));
    });

    expect(signOut).toHaveBeenCalledTimes(1);
    expect(endOtherSessions).toHaveBeenCalledTimes(1);
  });

  it("uses singular session copy", () => {
    render(
      <ScheduleSessionWarning
        sessionCount={1}
        onEndOtherSessions={vi.fn()}
        onSignOutThisDevice={vi.fn()}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("1 other tab or device");
  });

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

  describe("ScheduleCellBusyDialog", () => {
    it("names the editor and the cell, and offers a way through", () => {
      const editAnyway = vi.fn();
      const cancel = vi.fn();
      render(
        <ScheduleCellBusyDialog
          editorName="Casey Diaz"
          cellDescription="Jane Doe, Tue, Mar 3"
          onEditAnyway={editAnyway}
          onCancel={cancel}
        />,
      );

      expect(
        screen.getByText(/Casey Diaz is editing Jane Doe, Tue, Mar 3 right now/i),
      ).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: "Edit anyway" }));
      expect(editAnyway).toHaveBeenCalledTimes(1);
      fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
      expect(cancel).toHaveBeenCalledTimes(1);
    });

    it("still reads correctly when the cell cannot be described", () => {
      render(
        <ScheduleCellBusyDialog
          editorName="Casey Diaz"
          cellDescription={null}
          onEditAnyway={vi.fn()}
          onCancel={vi.fn()}
        />,
      );

      expect(screen.getByText(/Casey Diaz is editing this cell right now/i)).toBeTruthy();
    });

    // The whole point of this dialog is that it never ends anyone's session.
    it("offers no session-ending action", () => {
      render(
        <ScheduleCellBusyDialog
          editorName="Casey Diaz"
          cellDescription={null}
          onEditAnyway={vi.fn()}
          onCancel={vi.fn()}
        />,
      );

      expect(screen.queryByRole("button", { name: /end|sign out|use this tab/i })).toBeNull();
    });
  });
});
