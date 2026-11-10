import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SLIDEOVER_CLOSE_MS, useSlideoverClose } from "@/hooks/useSlideoverClose";

function Panel({
  onClose,
  dirty,
  onSave,
}: {
  onClose: () => void;
  dirty?: boolean;
  onSave?: () => Promise<boolean>;
}) {
  const { close, unsavedChangesDialog } = useSlideoverClose(onClose, {
    unsaved: dirty === undefined ? undefined : { hasUnsavedChanges: dirty, onSave },
  });
  return (
    <>
      <button type="button" aria-label="Close panel" onClick={close} />
      {unsavedChangesDialog}
    </>
  );
}

async function finishClosing() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, SLIDEOVER_CLOSE_MS + 20));
  });
}

describe("useSlideoverClose", () => {
  it("closes on Escape when it doesn't edit", async () => {
    const onClose = vi.fn();
    render(<Panel onClose={onClose} />);

    await userEvent.keyboard("{Escape}");
    await finishClosing();

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes without asking while clean", async () => {
    const onClose = vi.fn();
    render(<Panel onClose={onClose} dirty={false} />);

    await userEvent.click(screen.getByRole("button", { name: "Close panel" }));
    await finishClosing();

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("asks on Escape and on the X while dirty", async () => {
    const onClose = vi.fn();
    render(<Panel onClose={onClose} dirty />);

    await userEvent.keyboard("{Escape}");
    expect(screen.getByRole("alertdialog", { name: "Discard your changes?" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Keep editing" }));

    await userEvent.click(screen.getByRole("button", { name: "Close panel" }));
    await userEvent.click(screen.getByRole("button", { name: "Discard" }));
    await finishClosing();

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes after Save worked, and stays when it didn't", async () => {
    const onClose = vi.fn();
    const onSave = vi.fn(async () => false);
    const { rerender } = render(<Panel onClose={onClose} dirty onSave={onSave} />);

    await userEvent.click(screen.getByRole("button", { name: "Close panel" }));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await finishClosing();
    expect(onClose).not.toHaveBeenCalled();

    onSave.mockResolvedValue(true);
    rerender(<Panel onClose={onClose} dirty onSave={onSave} />);
    await userEvent.click(screen.getByRole("button", { name: "Close panel" }));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await finishClosing();
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
