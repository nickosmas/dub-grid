import { render, screen } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createReactNativeModule } from "../../../test/native";

const useAccessToken = vi.fn();
const useBootstrap = vi.fn();

vi.mock("react-native", async () => createReactNativeModule(await import("react")));

vi.mock("@expo/vector-icons/Ionicons", () => ({
  default: () => null,
}));

vi.mock("expo-router", () => ({
  router: { push: vi.fn() },
}));

vi.mock("../../auth/hooks/useAccessToken", () => ({
  useAccessToken,
}));

vi.mock("../../auth/hooks/useBootstrap", () => ({
  useBootstrap,
}));

let DashboardHeader: (typeof import("./DashboardHeader"))["DashboardHeader"];

beforeAll(async () => {
  DashboardHeader = (await import("./DashboardHeader")).DashboardHeader;
});

describe("DashboardHeader", () => {
  beforeEach(() => {
    useAccessToken.mockReturnValue("token-123");
    useBootstrap.mockReturnValue({ data: { unreadNotificationCount: 0 } });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("greets in two words with the viewer's first name", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-11T08:00:00"));
    vi.spyOn(Math, "random").mockReturnValue(0);

    render(<DashboardHeader firstName="Jordan" />);

    expect(screen.getByText("Morning, Jordan!")).toBeInTheDocument();
  });

  it("picks the other two-word variant for a different random draw", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-11T08:00:00"));
    vi.spyOn(Math, "random").mockReturnValue(0.99);

    render(<DashboardHeader firstName="Jordan" />);

    expect(screen.getByText("Hi, Jordan!")).toBeInTheDocument();
  });

  it("shows an afternoon greeting", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-11T14:00:00"));
    vi.spyOn(Math, "random").mockReturnValue(0);

    render(<DashboardHeader firstName="Jordan" />);

    expect(screen.getByText("Afternoon, Jordan!")).toBeInTheDocument();
  });

  it("shows an evening greeting", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-11T20:00:00"));
    vi.spyOn(Math, "random").mockReturnValue(0);

    render(<DashboardHeader firstName="Jordan" />);

    expect(screen.getByText("Evening, Jordan!")).toBeInTheDocument();
  });

  it("falls back to a name-less two-word greeting", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-11T08:00:00"));
    vi.spyOn(Math, "random").mockReturnValue(0);

    render(<DashboardHeader firstName={null} />);

    expect(screen.getByText("Good morning!")).toBeInTheDocument();
  });

  it("shows only the period beneath the greeting", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);

    render(<DashboardHeader firstName="Jordan" periodLabel="Jul 5–11, 2026" />);

    // The organization name and the facility clock left the header: the org
    // is on Profile and the clock on Schedule, and the header was the busiest
    // thing on the page.
    expect(screen.getByText("Jul 5–11, 2026")).toBeInTheDocument();
    expect(screen.queryByText(/Facility time/)).not.toBeInTheDocument();
    expect(screen.queryByText(/\|/)).not.toBeInTheDocument();
  });

  it("shows the alerts bell button", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);

    render(<DashboardHeader firstName="Jordan" />);

    expect(screen.getByRole("button", { name: "Open alerts" })).toBeInTheDocument();
  });
});
