import { render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { createReactNativeModule } from "../../../test/native";

vi.mock("react-native", async () => createReactNativeModule(await import("react")));

let CountBadge: (typeof import("./CountBadge"))["CountBadge"];

beforeAll(async () => {
  CountBadge = (await import("./CountBadge")).CountBadge;
});

describe("CountBadge", () => {
  it("renders the given label", () => {
    render(<CountBadge label="3 open" tone="warning" />);

    expect(screen.getByText("3 open")).toBeInTheDocument();
  });
});
