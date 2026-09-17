import { fireEvent, render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { createReactNativeModule } from "../../../test/native";

vi.mock("react-native", async () => createReactNativeModule(await import("react")));
vi.mock("@expo/vector-icons/Ionicons", () => ({ default: () => null }));

let DashboardCard: (typeof import("./DashboardCard"))["DashboardCard"];

beforeAll(async () => {
  DashboardCard = (await import("./DashboardCard")).DashboardCard;
});

describe("DashboardCard", () => {
  it("puts the title inside the card as the link to the full screen", () => {
    const onOpen = vi.fn();
    render(
      <DashboardCard title="Overtime watch" tone="danger" onOpen={onOpen}>
        <span>Rows</span>
      </DashboardCard>,
    );

    fireEvent.click(screen.getByRole("button", { name: "See all: Overtime watch" }));

    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Rows")).toBeInTheDocument();
  });

  it("renders a plain title and the summary sentence when it has nowhere to go", () => {
    render(
      <DashboardCard title="Recent activity" summary="Nothing changed today.">
        <span>Rows</span>
      </DashboardCard>,
    );

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByText("Recent activity")).toBeInTheDocument();
    expect(screen.getByText("Nothing changed today.")).toBeInTheDocument();
  });
});
