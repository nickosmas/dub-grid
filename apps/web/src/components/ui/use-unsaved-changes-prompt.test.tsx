import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { useUnsavedChangesPrompt } from "@/components/ui/use-unsaved-changes-prompt";

function Surface({
  dirty,
  onDiscard = vi.fn(),
  onSave,
  onSaved,
  onClose = vi.fn(),
}: {
  dirty: boolean;
  onDiscard?: () => void;
  onSave?: () => boolean | Promise<boolean>;
  onSaved?: () => void;
  onClose?: () => void;
}) {
  const { requestClose, unsavedChangesDialog } = useUnsavedChangesPrompt({
    hasUnsavedChanges: dirty,
    onDiscard,
    onSave,
    onSaved,
  });
  return (
    <>
      <button type="button" onClick={() => requestClose() && onClose()}>
        Close
      </button>
      {unsavedChangesDialog}
    </>
  );
}

describe("useUnsavedChangesPrompt", () => {
  it("closes without asking when nothing changed", async () => {
    const onClose = vi.fn();
    render(<Surface dirty={false} onClose={onClose} />);

    await userEvent.click(screen.getByRole("button", { name: "Close" }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("saves, then runs onSaved, when Save is chosen", async () => {
    const onSave = vi.fn(async () => true);
    const onSaved = vi.fn();
    const onDiscard = vi.fn();
    render(<Surface dirty onSave={onSave} onSaved={onSaved} onDiscard={onDiscard} />);

    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(onDiscard).not.toHaveBeenCalled();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("closes the prompt without onSaved when the save fails", async () => {
    const onSaved = vi.fn();
    render(<Surface dirty onSave={async () => false} onSaved={onSaved} />);

    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(onSaved).not.toHaveBeenCalled();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("discards from the three-choice prompt", async () => {
    const onDiscard = vi.fn();
    render(<Surface dirty onSave={async () => true} onDiscard={onDiscard} />);

    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    await userEvent.click(screen.getByRole("button", { name: "Discard" }));

    expect(onDiscard).toHaveBeenCalledTimes(1);
  });

  it("offers two choices when there is no save", async () => {
    render(<Surface dirty />);

    await userEvent.click(screen.getByRole("button", { name: "Close" }));

    expect(screen.getByRole("alertdialog", { name: "Discard your changes?" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Keep editing" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
  });
});
