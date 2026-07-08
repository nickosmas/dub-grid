import { fireEvent, render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { createReactNativeModule } from "../../test/native";

vi.mock("react-native", async () => createReactNativeModule(await import("react")));

vi.mock("@expo/vector-icons/Ionicons", () => ({
  default: () => null,
}));

let StatusBanner: (typeof import("./StatusBanner"))["StatusBanner"];
let EmptyStateCard: (typeof import("./EmptyStateCard"))["EmptyStateCard"];
let HeroSkeleton: (typeof import("./Skeleton"))["HeroSkeleton"];
let ListSkeleton: (typeof import("./Skeleton"))["ListSkeleton"];
let DetailSkeleton: (typeof import("./Skeleton"))["DetailSkeleton"];

beforeAll(async () => {
  StatusBanner = (await import("./StatusBanner")).StatusBanner;
  EmptyStateCard = (await import("./EmptyStateCard")).EmptyStateCard;
  const skeletonModule = await import("./Skeleton");
  HeroSkeleton = skeletonModule.HeroSkeleton;
  ListSkeleton = skeletonModule.ListSkeleton;
  DetailSkeleton = skeletonModule.DetailSkeleton;
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
    render(<EmptyStateCard compact iconName="people-outline" title="No one in ICU yet" />);

    expect(screen.getByText("No one in ICU yet")).toBeInTheDocument();
  });

  it("renders the shared skeleton variants", () => {
    render(
      <>
        <HeroSkeleton />
        <ListSkeleton />
        <DetailSkeleton />
      </>,
    );

    expect(screen.getByTestId("hero-skeleton")).toBeInTheDocument();
    expect(screen.getByTestId("list-skeleton")).toBeInTheDocument();
    expect(screen.getByTestId("detail-skeleton")).toBeInTheDocument();
  });
});
