import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import ShiftContextMenu, { resolveShiftRequestMenuState } from "@/components/ShiftContextMenu";

function makeElementAnchor(): HTMLDivElement {
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
  it("opens from the selected cell and shows the shared request actions without an arrow", () => {
    const anchorEl = makeElementAnchor();

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
    expect(document.body.querySelector('[data-slot="menu-arrow"]')).toBeNull();
  });

  it("closes when the window starts resizing", () => {
    const anchorEl = makeElementAnchor();
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
        onNeedCoverage={vi.fn()}
        onProposeSwap={vi.fn()}
        onClose={onClose}
      />,
    );

    window.dispatchEvent(new Event("resize"));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls the shared coverage handler from the selected cell menu", async () => {
    const user = userEvent.setup();
    const anchorEl = makeElementAnchor();
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

  it("offers Call off beside Drop shift and Swap", async () => {
    const user = userEvent.setup();
    const onCallOff = vi.fn();

    render(
      <ShiftContextMenu
        anchorEl={makeElementAnchor()}
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
        onCallOff={onCallOff}
        onClose={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("menuitem", { name: "Call off" }));

    expect(onCallOff).toHaveBeenCalledTimes(1);
  });

  it("says a request is active and opens it, instead of offering new ones", async () => {
    const user = userEvent.setup();
    const onViewRequest = vi.fn();

    render(
      <ShiftContextMenu
        anchorEl={makeElementAnchor()}
        hasShift
        hasClipboard={false}
        canEdit={false}
        canRequest={false}
        hasActiveRequest
        onCopy={vi.fn()}
        onPaste={vi.fn()}
        onClear={vi.fn()}
        onNeedCoverage={vi.fn()}
        onProposeSwap={vi.fn()}
        onCallOff={vi.fn()}
        onViewRequest={onViewRequest}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText("Request already active")).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Drop shift" })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Call off" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("menuitem", { name: "View request" }));

    expect(onViewRequest).toHaveBeenCalledTimes(1);
  });
});

describe("resolveShiftRequestMenuState", () => {
  it("offers requests on the viewer's own requestable shift", () => {
    expect(
      resolveShiftRequestMenuState({ isOwnShift: true, canRequest: true, hasActiveRequest: false }),
    ).toBe("request");
  });

  it("shows the active request even once nothing new can be asked", () => {
    expect(
      resolveShiftRequestMenuState({ isOwnShift: true, canRequest: false, hasActiveRequest: true }),
    ).toBe("active");
    expect(
      resolveShiftRequestMenuState({ isOwnShift: true, canRequest: true, hasActiveRequest: true }),
    ).toBe("active");
  });

  it("offers nothing on someone else's shift or a shift that can't be requested", () => {
    expect(
      resolveShiftRequestMenuState({
        isOwnShift: false,
        canRequest: false,
        hasActiveRequest: true,
      }),
    ).toBe("none");
    expect(
      resolveShiftRequestMenuState({
        isOwnShift: true,
        canRequest: false,
        hasActiveRequest: false,
      }),
    ).toBe("none");
  });
});
