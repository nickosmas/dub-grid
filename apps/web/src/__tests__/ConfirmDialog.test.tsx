import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import ConfirmDialog from "@/components/ConfirmDialog";

describe("ConfirmDialog", () => {
  it("supports a wider wrapped action layout for multi-action dialogs", () => {
    render(
      <ConfirmDialog
        title="Discard Changes?"
        message="Latest unpublished changes."
        confirmLabel="Discard my edits"
        secondaryConfirmLabel="Discard all org edits"
        onConfirm={vi.fn()}
        onSecondaryConfirm={vi.fn()}
        onCancel={vi.fn()}
        maxWidth={620}
        wrapActions
      />,
    );

    expect(screen.getByRole("dialog")).toHaveStyle({ maxWidth: "620px" });
    expect(
      screen
        .getAllByRole("button")
        .map((button) => button.textContent)
        .filter(Boolean),
    ).toEqual(["Cancel", "Discard all org edits", "Discard my edits"]);
  });

  it("can disable destructive actions while keeping cancel available", async () => {
    const onCancel = vi.fn();

    render(
      <ConfirmDialog
        title="Discard Changes?"
        message="Latest unpublished changes."
        confirmLabel="Discard my edits"
        secondaryConfirmLabel="Discard all org edits"
        onConfirm={vi.fn()}
        onSecondaryConfirm={vi.fn()}
        onCancel={onCancel}
        confirmDisabled
        secondaryConfirmDisabled
      />,
    );

    expect(screen.getByRole("button", { name: "Discard my edits" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Discard all org edits" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeEnabled();

    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("runs an async confirm once when it is double-clicked", async () => {
    let settle!: () => void;
    const onConfirm = vi.fn(() => new Promise<void>((resolve) => (settle = resolve)));

    render(
      <ConfirmDialog
        title="Delete shift?"
        message="This cannot be undone."
        confirmLabel="Delete"
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    );

    // Both clicks in one tick, with no await between them: `userEvent.click`
    // flushes React in between, which would hide the very race this guards.
    const confirmButton = screen.getByRole("button", { name: "Delete" });
    act(() => {
      fireEvent.click(confirmButton);
      fireEvent.click(confirmButton);
    });

    expect(onConfirm).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: /Delete/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();

    await act(async () => {
      settle();
    });
  });

  it("lets a caller's own isLoading override the dialog's busy state", () => {
    render(
      <ConfirmDialog
        title="Remove member?"
        message="They lose access immediately."
        confirmLabel="Remove"
        // The pending flag lives outside this dialog, keyed by row, so the
        // dialog must defer to it rather than to its own idle latch.
        isLoading
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: /Remove/ })).toBeDisabled();
  });
});

describe("ConfirmDialog dismissal", () => {
  it.each(["primary", "secondary"])(
    "keeps every exit blocked during a %s request",
    async (action) => {
      let settle!: () => void;
      const pending = () =>
        new Promise<void>((resolve) => {
          settle = resolve;
        });
      const onCancel = vi.fn();
      render(
        <ConfirmDialog
          title="Discard edits?"
          message="Choose which edits to discard."
          confirmLabel="Discard mine"
          secondaryConfirmLabel="Discard all"
          isLoading={false}
          isSecondaryLoading={false}
          onConfirm={pending}
          onSecondaryConfirm={pending}
          onCancel={onCancel}
        />,
      );
      await userEvent.click(
        screen.getByRole("button", { name: action === "primary" ? "Discard mine" : "Discard all" }),
      );
      expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
      expect(screen.queryByRole("button", { name: "Close modal" })).toBeNull();
      fireEvent.click(screen.getByRole("presentation"));
      fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
      await new Promise((resolve) => setTimeout(resolve, 180));
      expect(onCancel).not.toHaveBeenCalled();
      await act(async () => {
        settle();
      });
      await userEvent.keyboard("{Escape}");
      await waitFor(() => expect(onCancel).toHaveBeenCalledOnce());
    },
  );
});
