import { render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { createReactNativeModule } from "../../test/native";

vi.mock("react-native", async () => createReactNativeModule(await import("react")));

let Collapsible: (typeof import("./Collapsible"))["Collapsible"];

beforeAll(async () => {
  Collapsible = (await import("./Collapsible")).Collapsible;
});

describe("Collapsible", () => {
  it("renders its children when open", () => {
    render(
      <Collapsible open>
        <span>Shift notes</span>
      </Collapsible>,
    );
    expect(screen.getByText("Shift notes")).toBeInTheDocument();
  });

  // Load-bearing: this replaced LayoutAnimation, which never unmounted the
  // collapsed content either. Screen tests query inside collapsed sections, and
  // unmounting would break them while looking like a harmless refactor.
  it("keeps children mounted while closed", () => {
    render(
      <Collapsible open={false}>
        <span>Shift notes</span>
      </Collapsible>,
    );
    expect(screen.getByText("Shift notes")).toBeInTheDocument();
  });

  it("keeps children mounted across a toggle", () => {
    const { rerender } = render(
      <Collapsible open>
        <span>Shift notes</span>
      </Collapsible>,
    );
    expect(screen.getByText("Shift notes")).toBeInTheDocument();

    rerender(
      <Collapsible open={false}>
        <span>Shift notes</span>
      </Collapsible>,
    );
    expect(screen.getByText("Shift notes")).toBeInTheDocument();
  });

  it("forwards a testID to the animated container", () => {
    render(
      <Collapsible open testID="notes-collapsible">
        <span>Shift notes</span>
      </Collapsible>,
    );
    expect(screen.getByTestId("notes-collapsible")).toBeInTheDocument();
  });
});
