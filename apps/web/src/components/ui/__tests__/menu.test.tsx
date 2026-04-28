import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Menu, MenuContent, MenuItem } from "@/components/ui/menu";

function makeAnchor(): HTMLDivElement {
  const anchor = document.createElement("div");
  Object.defineProperty(anchor, "getBoundingClientRect", {
    value: () =>
      ({
        x: 120,
        y: 80,
        top: 80,
        left: 120,
        bottom: 108,
        right: 168,
        width: 48,
        height: 28,
        toJSON: () => ({}),
      }) as DOMRect,
  });
  document.body.appendChild(anchor);
  return anchor;
}

describe("ui/menu", () => {
  it("renders controlled menu content in a portal with an external anchor and optional arrow", async () => {
    const anchor = makeAnchor();
    const { container, rerender } = render(
      <Menu open>
        <MenuContent anchor={anchor} showArrow>
          <MenuItem>First action</MenuItem>
        </MenuContent>
      </Menu>,
    );

    expect(container).not.toHaveTextContent("First action");
    expect(screen.getByRole("menuitem", { name: "First action" })).toBeInTheDocument();
    const arrow = document.body.querySelector('[data-slot="menu-arrow"]');
    expect(arrow).not.toBeNull();
    expect(arrow?.tagName).toBe("svg");

    rerender(
      <Menu open={false}>
        <MenuContent anchor={anchor} showArrow>
          <MenuItem>First action</MenuItem>
        </MenuContent>
      </Menu>,
    );

    await waitFor(() => {
      expect(
        screen.queryByRole("menuitem", { name: "First action" }),
      ).not.toBeInTheDocument();
    });
  });
});
