import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import Modal from "@/components/Modal";
import ConfirmDialog from "@/components/ConfirmDialog";
import { useState } from "react";

function renderModal(onClose = vi.fn(), title = "Test Modal") {
  return render(
    <Modal title={title} onClose={onClose}>
      <p>Modal content</p>
    </Modal>,
  );
}

describe("Modal — Accessibility", () => {
  it("renders element with role='dialog'", () => {
    renderModal();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("dialog has aria-modal='true'", () => {
    renderModal();
    expect(screen.getByRole("dialog")).toHaveAttribute("aria-modal", "true");
  });

  it("dialog has aria-label equal to the title prop", () => {
    renderModal(vi.fn(), "My Dialog");
    expect(screen.getByRole("dialog")).toHaveAttribute("aria-label", "My Dialog");
  });

  it("close button has aria-label='Close modal'", () => {
    renderModal();
    expect(screen.getByRole("button", { name: "Close modal" })).toBeInTheDocument();
  });
});

describe("Modal — Rendering", () => {
  it("renders title text inside the dialog", () => {
    renderModal(vi.fn(), "Hello World");
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("Hello World");
  });

  it("renders children inside the dialog", () => {
    renderModal();
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("Modal content");
    expect(dialog.querySelector(".dg-modal-scroll-region")).toContainElement(
      screen.getByText("Modal content"),
    );
  });

  it("pins the footer outside the scroll region and marks the dialog", () => {
    render(
      <Modal title="With footer" onClose={vi.fn()} footer={<button type="button">Save</button>}>
        <p>Modal content</p>
      </Modal>,
    );
    const dialog = screen.getByRole("dialog");
    const save = screen.getByRole("button", { name: "Save" });
    expect(dialog.querySelector(".dg-modal-footer")).toContainElement(save);
    expect(save.closest(".dg-modal-scroll-region")).toBeNull();
    expect(dialog).toHaveClass("dg-modal--with-footer");
  });

  it("renders no footer band without a footer", () => {
    renderModal();
    const dialog = screen.getByRole("dialog");
    expect(dialog.querySelector(".dg-modal-footer")).toBeNull();
    expect(dialog).not.toHaveClass("dg-modal--with-footer");
  });
});

describe("Modal — Focus", () => {
  it("first focusable element receives focus on mount", async () => {
    renderModal();
    const closeBtn = screen.getByRole("button", { name: "Close modal" });
    await waitFor(() => expect(document.activeElement).toBe(closeBtn));
  });
});

describe("Modal — Close interactions", () => {
  it("clicking close button calls onClose", async () => {
    const onClose = vi.fn();
    renderModal(onClose);
    await userEvent.click(screen.getByRole("button", { name: "Close modal" }));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it("clicking backdrop calls onClose", async () => {
    const onClose = vi.fn();
    renderModal(onClose);
    const backdrop = screen.getByRole("presentation");
    await userEvent.click(backdrop);
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it("clicking inside dialog content does NOT call onClose", async () => {
    const onClose = vi.fn();
    renderModal(onClose);
    await userEvent.click(screen.getByRole("dialog"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("pressing Escape key calls onClose", async () => {
    const onClose = vi.fn();
    renderModal(onClose);
    const backdrop = screen.getByRole("presentation");
    fireEvent.keyDown(backdrop, { key: "Escape" });
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it("does not close when onRequestClose blocks dismissal", async () => {
    const onClose = vi.fn();
    const onRequestClose = vi.fn(() => false);

    render(
      <Modal title="Guarded Modal" onClose={onClose} onRequestClose={onRequestClose}>
        <p>Modal content</p>
      </Modal>,
    );

    await userEvent.click(screen.getByRole("button", { name: "Close modal" }));

    expect(onRequestClose).toHaveBeenCalledOnce();
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe("Modal focus lifecycle", () => {
  it("returns focus to the editor after canceling its nested confirmation", async () => {
    const closeEditor = vi.fn();
    function Editor() {
      const [confirming, setConfirming] = useState(false);
      return (
        <Modal title="Editor" onClose={closeEditor}>
          <button onClick={() => setConfirming(true)}>Remove entry</button>
          {confirming ? (
            <ConfirmDialog
              title="Remove entry?"
              message="This cannot be undone."
              onCancel={() => setConfirming(false)}
              onConfirm={vi.fn()}
            />
          ) : null}
        </Modal>
      );
    }
    render(<Editor />);
    const trigger = screen.getByRole("button", { name: "Remove entry" });
    await userEvent.click(trigger);
    await waitFor(() => expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus());
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(closeEditor).not.toHaveBeenCalled();
  });

  it("returns focus to a surviving target when its menu invoker disappears", async () => {
    const target = document.createElement("button");
    const menuItem = document.createElement("button");
    document.body.append(target, menuItem);
    menuItem.focus();
    const view = render(
      <Modal title="Menu action" onClose={vi.fn()} returnFocus={{ current: target }}>
        <p>Confirm the action</p>
      </Modal>,
    );
    await waitFor(() => expect(screen.getByRole("button", { name: "Close modal" })).toHaveFocus());
    menuItem.remove();
    view.unmount();
    await waitFor(() => expect(target).toHaveFocus());
    target.remove();
  });

  it("restores focus to its invoker when dismissed", async () => {
    const trigger = document.createElement("button");
    document.body.appendChild(trigger);
    trigger.focus();
    const view = renderModal();
    await waitFor(() => expect(screen.getByRole("button", { name: "Close modal" })).toHaveFocus());
    view.unmount();
    await waitFor(() => expect(trigger).toHaveFocus());
    trigger.remove();
  });

  it("keeps keyboard focus in the active dialog", async () => {
    renderModal();
    const close = screen.getByRole("button", { name: "Close modal" });
    await waitFor(() => expect(close).toHaveFocus());
    await userEvent.tab();
    await waitFor(() => expect(close).toHaveFocus());
    await userEvent.tab({ shift: true });
    await waitFor(() => expect(close).toHaveFocus());
  });
});
