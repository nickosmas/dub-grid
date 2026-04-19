import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import ShiftContextMenu from "@/components/ShiftContextMenu";

function makeAnchor(): HTMLDivElement {
  const anchor = document.createElement("div");
  Object.defineProperty(anchor, "getBoundingClientRect", {
    value: () => ({
      x: 80,
      y: 120,
      top: 120,
      left: 80,
      bottom: 148,
      right: 108,
      width: 28,
      height: 28,
      toJSON: () => ({}),
    }),
  });
  document.body.appendChild(anchor);
  return anchor;
}

describe("ShiftContextMenu", () => {
  it("shows Drop shift and Swap without separate pickup or calloff actions", () => {
    const anchorEl = makeAnchor();

    render(
      <ShiftContextMenu
        anchorEl={anchorEl}
        hasShift
        hasClipboard={false}
        canEdit={false}
        canRequest
        hasActiveRequest={false}
        onCopy={vi.fn()}
        onPaste={vi.fn()}
        onClear={vi.fn()}
        onNeedCoverage={vi.fn()}
        onProposeSwap={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByRole("menuitem", { name: "Drop shift" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Swap" })).toBeInTheDocument();
    expect(screen.queryByText("Make available for pickup")).not.toBeInTheDocument();
    expect(screen.queryByText("Call off")).not.toBeInTheDocument();
  });

  it("calls the shared coverage handler from the menu", async () => {
    const user = userEvent.setup();
    const anchorEl = makeAnchor();
    const onNeedCoverage = vi.fn();
    const onClose = vi.fn();

    render(
      <ShiftContextMenu
        anchorEl={anchorEl}
        hasShift
        hasClipboard={false}
        canEdit={false}
        canRequest
        hasActiveRequest={false}
        onCopy={vi.fn()}
        onPaste={vi.fn()}
        onClear={vi.fn()}
        onNeedCoverage={onNeedCoverage}
        onProposeSwap={vi.fn()}
        onClose={onClose}
      />,
    );

    await user.click(screen.getByRole("menuitem", { name: "Drop shift" }));

    expect(onNeedCoverage).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
