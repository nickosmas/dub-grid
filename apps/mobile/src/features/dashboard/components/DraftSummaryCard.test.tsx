import { render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { createReactNativeModule, createSafeAreaContextModule } from "../../../test/native";

vi.mock("react-native", async () => createReactNativeModule(await import("react")));

vi.mock("react-native-safe-area-context", async () =>
  createSafeAreaContextModule(await import("react")),
);

let DraftSummaryCard: (typeof import("./DraftSummaryCard"))["DraftSummaryCard"];

beforeAll(async () => {
  DraftSummaryCard = (await import("./DraftSummaryCard")).DraftSummaryCard;
});

describe("DraftSummaryCard", () => {
  it("shows the total and only non-zero draft classifications", () => {
    render(
      <DraftSummaryCard summary={{ newCount: 1, modifiedCount: 2, deletedCount: 0, total: 3 }} />,
    );

    expect(screen.getByText("Unpublished changes")).toBeInTheDocument();
    // No count pill in the header; the rows carry the numbers.
    expect(screen.queryByText("3")).not.toBeInTheDocument();
    expect(screen.getByText("1 new change")).toBeInTheDocument();
    expect(screen.getByText("2 modified changes")).toBeInTheDocument();
    expect(screen.queryByText(/deleted change/)).not.toBeInTheDocument();
  });

  it("renders nothing for an authorized zero summary", () => {
    const { container } = render(
      <DraftSummaryCard summary={{ newCount: 0, modifiedCount: 0, deletedCount: 0, total: 0 }} />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
