import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const stackScreenOptions: { title?: string }[] = [];

vi.mock("expo-router", () => ({
  Stack: {
    Screen: (props: { options?: { title?: string } }) => {
      stackScreenOptions.push(props.options ?? {});
      return null;
    },
  },
}));

import { HeaderTitle } from "./HeaderTitle";

describe("HeaderTitle", () => {
  beforeEach(() => {
    stackScreenOptions.length = 0;
  });

  it("hands the title to the route's own native header", () => {
    render(<HeaderTitle title="Mina Diaz" />);

    expect(stackScreenOptions).toEqual([{ title: "Mina Diaz" }]);
  });

  // Only the title. Everything else about the header belongs to the layout's
  // options for the route, including whether it takes a large title at all —
  // restating any of it here would silently override the route, which is how
  // the scroll-driven version this replaced switched the real large title off.
  it("sets nothing but the title", () => {
    render(<HeaderTitle title="Mina Diaz" />);

    expect(Object.keys(stackScreenOptions[0] ?? {})).toEqual(["title"]);
  });

  // A fresh options object on every unrelated render makes the native screen
  // re-apply its animation, gesture and content config each time.
  it("does not reconfigure the header when the title has not changed", () => {
    const { rerender } = render(<HeaderTitle title="Mina Diaz" />);
    rerender(<HeaderTitle title="Mina Diaz" />);

    expect(stackScreenOptions).toHaveLength(1);
  });

  it("reconfigures once the title does change", () => {
    const { rerender } = render(<HeaderTitle title="Mina Diaz" />);
    rerender(<HeaderTitle title="Ada Lovelace" />);

    expect(stackScreenOptions).toEqual([{ title: "Mina Diaz" }, { title: "Ada Lovelace" }]);
  });
});
