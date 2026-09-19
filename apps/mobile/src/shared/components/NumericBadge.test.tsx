import { render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { createReactNativeModule } from "../../test/native";

vi.mock("react-native", async () => createReactNativeModule(await import("react")));

let NumericBadge: (typeof import("./NumericBadge"))["NumericBadge"];

beforeAll(async () => {
  NumericBadge = (await import("./NumericBadge")).NumericBadge;
});

describe("NumericBadge", () => {
  it.each([1, 26, 99])("renders %s through both sizes", (count) => {
    render(
      <>
        <NumericBadge count={count} size="sm" label={`${count} small`} />
        <NumericBadge count={count} size="md" label={`${count} inline`} />
      </>,
    );

    expect(screen.getByLabelText(`${count} small`)).toHaveTextContent(String(count));
    expect(screen.getByLabelText(`${count} inline`)).toHaveTextContent(String(count));
  });

  it("clamps at the shared maximum", () => {
    render(<NumericBadge count={100} label="unread" />);

    expect(screen.getByLabelText("unread")).toHaveTextContent("99+");
  });

  it("clamps at a bell's maximum of 9", () => {
    render(<NumericBadge count={10} max={9} label="unread" />);

    expect(screen.getByLabelText("unread")).toHaveTextContent("9+");
  });

  it("renders nothing for a zero count", () => {
    const { container } = render(<NumericBadge count={0} label="unread" />);

    expect(container).toBeEmptyDOMElement();
  });

  it("carries no accessible name when it is an inline count", () => {
    render(<NumericBadge count={4} />);

    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.queryByLabelText(/4/)).not.toBeInTheDocument();
  });
});
