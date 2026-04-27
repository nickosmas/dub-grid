import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Popover, PopoverContent } from "@/components/ui/popover";

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

describe("ui/popover", () => {
  it("renders controlled content in a portal with an external anchor and optional arrow", async () => {
    const anchor = makeAnchor();
    const { container, rerender } = render(
      <Popover open>
        <PopoverContent anchor={anchor} showArrow>
          <div>Popover body</div>
        </PopoverContent>
      </Popover>,
    );

    expect(container).not.toHaveTextContent("Popover body");
    expect(screen.getByText("Popover body")).toBeInTheDocument();
    const arrow = document.body.querySelector('[data-slot="popover-arrow"]');
    expect(arrow).not.toBeNull();
    expect(arrow?.tagName).toBe("svg");

    rerender(
      <Popover open={false}>
        <PopoverContent anchor={anchor} showArrow>
          <div>Popover body</div>
        </PopoverContent>
      </Popover>,
    );

    await waitFor(() => {
      expect(screen.queryByText("Popover body")).not.toBeInTheDocument();
    });
  });
});
