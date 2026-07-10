import { render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createReactNativeModule } from "../../../test/native";

vi.mock("react-native", async () => createReactNativeModule(await import("react")));

let DashboardHeader: (typeof import("./DashboardHeader"))["DashboardHeader"];

beforeAll(async () => {
  DashboardHeader = (await import("./DashboardHeader")).DashboardHeader;
});

describe("DashboardHeader", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("shows a morning greeting with the viewer's first name on one line", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-11T08:00:00"));
    vi.spyOn(Math, "random").mockReturnValue(0);

    render(<DashboardHeader firstName="Jordan" orgName="Acme Care" timezone="America/Los_Angeles" />);

    expect(screen.getByText("Good morning, Jordan!")).toBeInTheDocument();
  });

  it("picks a different variant from the morning pool for a different random draw", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-11T08:00:00"));
    vi.spyOn(Math, "random").mockReturnValue(0.99);

    render(<DashboardHeader firstName="Jordan" orgName="Acme Care" timezone={null} />);

    expect(screen.getByText("Let's get the day going, Jordan!")).toBeInTheDocument();
  });

  it("shows an afternoon greeting", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-11T14:00:00"));
    vi.spyOn(Math, "random").mockReturnValue(0);

    render(<DashboardHeader firstName="Jordan" orgName="Acme Care" timezone={null} />);

    expect(screen.getByText("Good afternoon, Jordan!")).toBeInTheDocument();
  });

  it("shows an evening greeting", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-11T20:00:00"));
    vi.spyOn(Math, "random").mockReturnValue(0);

    render(<DashboardHeader firstName="Jordan" orgName="Acme Care" timezone={null} />);

    expect(screen.getByText("Good evening, Jordan!")).toBeInTheDocument();
  });

  it("falls back to a name-less greeting", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-11T08:00:00"));
    vi.spyOn(Math, "random").mockReturnValue(0);

    render(<DashboardHeader firstName={null} orgName="Acme Care" timezone={null} />);

    expect(screen.getByText("Good morning!")).toBeInTheDocument();
  });

  it("renders the org name alongside the local time", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);

    render(<DashboardHeader firstName="Jordan" orgName="Acme Care" timezone="America/Los_Angeles" />);

    expect(screen.getByText(/Acme Care/)).toBeInTheDocument();
  });
});
