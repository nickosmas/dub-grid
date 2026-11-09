import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { UnsavedChangesBar, UnsavedChangesScope } from "./UnsavedChangesBar";

const region = () => screen.queryByRole("region", { name: "Unsaved changes" });

function renderBar(props: Partial<Parameters<typeof UnsavedChangesBar>[0]> = {}) {
  return render(
    <UnsavedChangesScope>
      <div className="dg-card">Section</div>
      <UnsavedChangesBar onSave={vi.fn()} {...props} />
    </UnsavedChangesScope>,
  );
}

describe("UnsavedChangesBar", () => {
  it("shows Discard and Save changes when both can be pressed", () => {
    renderBar({ onDiscard: vi.fn() });

    expect(region()).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Discard" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Save changes" })).toBeEnabled();
  });

  it("stays while Save is blocked but Discard can still be pressed", () => {
    renderBar({ onDiscard: vi.fn(), saveDisabled: true });

    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Discard" })).toBeEnabled();
  });

  it("hides when no button can be pressed", () => {
    renderBar({ saveDisabled: true });

    expect(region()).not.toBeInTheDocument();
  });

  it("stays while a save is underway, though both buttons are off", () => {
    renderBar({ onDiscard: vi.fn(), saving: true, saveDisabled: true });

    expect(region()).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Discard" })).toBeDisabled();
  });

  it("renders at the end of its scope, outside the card it closes", () => {
    renderBar({ onDiscard: vi.fn() });

    expect(region()?.closest(".dg-card")).toBeNull();
  });
});
