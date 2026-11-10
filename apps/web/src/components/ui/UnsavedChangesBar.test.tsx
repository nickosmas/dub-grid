import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { NavigationGuardProvider } from "@/components/NavigationGuardProvider";
import { UnsavedChangesBar, UnsavedChangesScope } from "./UnsavedChangesBar";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

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
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Discard" })).not.toBeInTheDocument();
    expect(region()).not.toBeInTheDocument();
    expect(footer()).not.toHaveAttribute("data-sticky");
  });

  it("floats with Discard and Save once something changed", () => {
    renderBar({ onDiscard: vi.fn() });

    expect(region()).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Discard" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
    expect(footer()).toHaveAttribute("data-sticky");
  });

  it("still floats while Save is blocked but Discard can be pressed", () => {
    renderBar({ onDiscard: vi.fn(), saveDisabled: true });

    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
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

describe("UnsavedChangesBar leave guard", () => {
  function renderGuarded(props: Partial<Parameters<typeof UnsavedChangesBar>[0]>) {
    const navigate = vi.fn();
    render(
      <NavigationGuardProvider>
        <a
          href="/settings?section=jobs"
          onClick={(event) => {
            event.preventDefault();
            navigate();
          }}
        >
          Jobs
        </a>
        <UnsavedChangesScope>
          <UnsavedChangesBar dirty onSave={vi.fn()} {...props} />
        </UnsavedChangesScope>
      </NavigationGuardProvider>,
    );
    return navigate;
  }

  it("asks before a link leaves a dirty section", async () => {
    const navigate = renderGuarded({});

    await userEvent.click(screen.getByRole("link", { name: "Jobs" }));

    expect(navigate).not.toHaveBeenCalled();
    expect(screen.getByText("Discard your changes?")).toBeInTheDocument();
  });

  it("lets a link through while nothing changed", async () => {
    const navigate = renderGuarded({ dirty: false });

    await userEvent.click(screen.getByRole("link", { name: "Jobs" }));

    expect(navigate).toHaveBeenCalledTimes(1);
  });

  it("offers Save with a leave save, and leaves once it worked", async () => {
    const leaveSave = vi.fn(async () => true);
    const navigate = renderGuarded({ leaveSave });

    await userEvent.click(screen.getByRole("link", { name: "Jobs" }));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(leaveSave).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledTimes(1);
  });

  it("doesn't offer Save while the section can't be saved", async () => {
    renderGuarded({ leaveSave: vi.fn(async () => true), saveDisabled: true });

    await userEvent.click(screen.getByRole("link", { name: "Jobs" }));

    expect(screen.getByText("Discard your changes?")).toBeInTheDocument();
  });
});
