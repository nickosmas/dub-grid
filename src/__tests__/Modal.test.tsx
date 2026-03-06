import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import Modal from "@/components/Modal";

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
    expect(screen.getByRole("dialog")).toHaveAttribute(
      "aria-label",
      "My Dialog",
    );
  });

  it("close button has aria-label='Close modal'", () => {
    renderModal();
    expect(
      screen.getByRole("button", { name: "Close modal" }),
    ).toBeInTheDocument();
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
  });
});

describe("Modal — Focus", () => {
  it("dialog element receives focus on mount", () => {
    renderModal();
    const dialog = screen.getByRole("dialog");
    expect(document.activeElement).toBe(dialog);
  });
});

describe("Modal — Close interactions", () => {
  it("clicking close button calls onClose", async () => {
    const onClose = vi.fn();
    renderModal(onClose);
    await userEvent.click(screen.getByRole("button", { name: "Close modal" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("clicking backdrop calls onClose", async () => {
    const onClose = vi.fn();
    renderModal(onClose);
    const backdrop = screen.getByRole("presentation");
    await userEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("clicking inside dialog content does NOT call onClose", async () => {
    const onClose = vi.fn();
    renderModal(onClose);
    await userEvent.click(screen.getByRole("dialog"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("pressing Escape key calls onClose", () => {
    const onClose = vi.fn();
    renderModal(onClose);
    const backdrop = screen.getByRole("presentation");
    fireEvent.keyDown(backdrop, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
