import { fireEvent, render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { createReactNativeModule } from "../../test/native";

vi.mock("react-native", async () => createReactNativeModule(await import("react")));

vi.mock("@expo/vector-icons/Ionicons", () => ({
  default: () => null,
}));

let StatusBanner: (typeof import("./StatusBanner"))["StatusBanner"];
let EmptyStateCard: (typeof import("./EmptyStateCard"))["EmptyStateCard"];
let CardRowListSkeleton: (typeof import("./skeleton"))["CardRowListSkeleton"];

beforeAll(async () => {
  StatusBanner = (await import("./StatusBanner")).StatusBanner;
  EmptyStateCard = (await import("./EmptyStateCard")).EmptyStateCard;
  CardRowListSkeleton = (await import("./skeleton")).CardRowListSkeleton;
});

describe("mobile shared state components", () => {
  it("renders status and empty-state content with actions", () => {
    const onRetry = vi.fn();
    const onExplore = vi.fn();

    render(
      <>
        <StatusBanner
          actionLabel="Retry"
          body="Something went wrong."
          onAction={onRetry}
          title="Could not load data"
        />
        <EmptyStateCard
          actionLabel="Explore"
          body="Nothing has landed here yet."
          iconName="cube"
          onAction={onExplore}
          title="No items yet"
        />
      </>,
    );

    expect(screen.getByText("Could not load data")).toBeInTheDocument();
    expect(screen.getByText("No items yet")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Retry"));
    fireEvent.click(screen.getByText("Explore"));

    expect(onRetry).toHaveBeenCalled();
    expect(onExplore).toHaveBeenCalled();
  });

  it("renders the compact empty-state variant without a body", () => {
    render(<EmptyStateCard compact iconName="people" title="No one in ICU yet" />);

    expect(screen.getByText("No one in ICU yet")).toBeInTheDocument();
  });

  it("renders a skeleton under the one testID every screen shares", () => {
    render(<CardRowListSkeleton rows={2} />);

    // Every skeleton composition roots at `SkeletonGroup`, so screens assert
    // that *a* placeholder is showing rather than which silhouette it is.
    expect(screen.getByTestId("skeleton")).toBeInTheDocument();
  });
});
