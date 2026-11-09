import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { UnsavedChangesBar, UnsavedChangesScope } from "./UnsavedChangesBar";

const region = () => screen.queryByRole("region", { name: "Unsaved changes" });
const footer = () => document.querySelector<HTMLElement>(".dg-unsaved-bar");

function renderBar(props: Partial<Parameters<typeof UnsavedChangesBar>[0]> = {}) {
  return render(
    <UnsavedChangesScope>
      <div className="dg-card">Section</div>
      <UnsavedChangesBar dirty onSave={vi.fn()} {...props} />
    </UnsavedChangesScope>,
  );
}

describe("UnsavedChangesBar", () => {
  it("stays as the section's footer with Save off while nothing has changed", () => {
    renderBar({ dirty: false, onDiscard: vi.fn() });

    expect(footer()).not.toBeNull();
    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Discard" })).not.toBeInTheDocument();
    expect(region()).not.toBeInTheDocument();
    expect(footer()).not.toHaveAttribute("data-sticky");
  });

  it("floats with Discard and Save changes once something changed", () => {
    renderBar({ onDiscard: vi.fn() });

    expect(region()).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Discard" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Save changes" })).toBeEnabled();
    expect(footer()).toHaveAttribute("data-sticky");
  });

  it("still floats while Save is blocked but Discard can be pressed", () => {
    renderBar({ onDiscard: vi.fn(), saveDisabled: true });

    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
    expect(footer()).toHaveAttribute("data-sticky");
  });

  it("stays put when no button can be pressed", () => {
    renderBar({ saveDisabled: true });

    expect(footer()).not.toBeNull();
    expect(footer()).not.toHaveAttribute("data-sticky");
  });

  it("keeps floating while a save is underway, though both buttons are off", () => {
    renderBar({ onDiscard: vi.fn(), saving: true, saveDisabled: true });

    expect(screen.getByRole("button", { name: "Discard" })).toBeDisabled();
    expect(footer()).toHaveAttribute("data-sticky");
  });

  it("renders at the end of its scope, outside the card it closes", () => {
    renderBar({ onDiscard: vi.fn() });

    expect(footer()?.closest(".dg-card")).toBeNull();
  });
});
