import { render, screen } from "@testing-library/react";
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
    expect(screen.getByRole("button", { name: "Discard my edits" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Discard all org edits" })).toBeInTheDocument();
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
});
