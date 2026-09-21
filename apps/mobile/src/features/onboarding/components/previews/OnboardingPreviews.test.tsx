import { render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { createReactNativeModule, createScreenModule } from "../../../../test/native";

// The previews import the Home and Requests screen modules for their cards,
// so the screens' own dependencies are stubbed the way their tests stub them.
// None of these is called: the previews render the cards, not the screens.
vi.mock("react-native", async () => createReactNativeModule(await import("react")));

vi.mock("@expo/vector-icons/Ionicons", () => ({
  default: () => null,
}));

vi.mock("@tanstack/react-query", () => ({
  onlineManager: {
    isOnline: () => true,
  },
  keepPreviousData: (previousData: unknown) => previousData,
  useInfiniteQuery: vi.fn(),
  useMutation: vi.fn(),
  useQuery: vi.fn(),
  useQueryClient: vi.fn(),
}));

vi.mock("expo-router", () => ({
  router: {
    push: vi.fn(),
  },
  useLocalSearchParams: vi.fn(() => ({})),
}));

vi.mock("../../../../shared/components/Screen", async () =>
  createScreenModule(await import("react")),
);

vi.mock("../../../auth/hooks/useAccessToken", () => ({
  useAccessToken: vi.fn(),
}));

vi.mock("../../../auth/hooks/useBootstrap", () => ({
  useBootstrap: vi.fn(),
}));

vi.mock("../../../../shared/providers/ToastProvider", () => ({
  useToast: () => ({
    pushToast: vi.fn(),
  }),
}));

let UpcomingShiftPreview: (typeof import("./UpcomingShiftPreview"))["UpcomingShiftPreview"];
let CoverShiftsPreview: (typeof import("./CoverShiftsPreview"))["CoverShiftsPreview"];
let formatScheduleDayLabel: (typeof import("../../../schedule/lib/schedule"))["formatScheduleDayLabel"];
let getPreviewToday: (typeof import("./sample-data"))["getPreviewToday"];

beforeAll(async () => {
  ({ UpcomingShiftPreview } = await import("./UpcomingShiftPreview"));
  ({ CoverShiftsPreview } = await import("./CoverShiftsPreview"));
  ({ formatScheduleDayLabel } = await import("../../../schedule/lib/schedule"));
  ({ getPreviewToday } = await import("./sample-data"));
});

describe("UpcomingShiftPreview", () => {
  it("shows the sample shift on duty today", () => {
    render(<UpcomingShiftPreview />);

    expect(screen.getByText("On Duty")).toBeInTheDocument();
    expect(screen.getByText("Day Shift")).toBeInTheDocument();
    expect(screen.getByText("Sheltered Care")).toBeInTheDocument();
    expect(screen.getByText("7:00 AM - 3:30 PM")).toBeInTheDocument();
  });

  // Frozen at 9:41 rather than the real clock, so the tour never opens on a
  // hero that says "Starting in 9h" with no progress bar.
  it("keeps the shift mid-way whatever the hour", () => {
    render(<UpcomingShiftPreview />);

    expect(screen.getByText("5h 49m left")).toBeInTheDocument();
  });

  // The card itself, not the page around it: no simulated status bar,
  // bezel or island, and none of Home's header (the date and week range).
  it("draws neither device chrome nor the page header", () => {
    render(<UpcomingShiftPreview />);

    const today = getPreviewToday();
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    expect(screen.queryByText("9:41")).not.toBeInTheDocument();
    expect(
      screen.queryByText(formatScheduleDayLabel(today, new Date(), timeZone)),
    ).not.toBeInTheDocument();
  });

  it("stacks three shiftmates and counts the rest", () => {
    render(<UpcomingShiftPreview />);

    expect(screen.getByText("Working with")).toBeInTheDocument();
    expect(screen.getByText("CP")).toBeInTheDocument();
    expect(screen.getByText("EH")).toBeInTheDocument();
    expect(screen.getByText("QM")).toBeInTheDocument();
    expect(screen.getByText("+1")).toBeInTheDocument();
  });
});

describe("CoverShiftsPreview", () => {
  it("shows the Available list with an open shift to claim", () => {
    render(<CoverShiftsPreview />);

    expect(screen.getByText("Open shift")).toBeInTheDocument();
    expect(screen.getByText("Day Shift")).toBeInTheDocument();
    expect(screen.getByText("Skilled Nursing")).toBeInTheDocument();
    expect(screen.getByText("1 teammate needed")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Claim" })).toBeInTheDocument();
  });

  it("leaves the page title and tab strip behind", () => {
    render(<CoverShiftsPreview />);

    expect(screen.queryByText("Requests")).not.toBeInTheDocument();
    expect(screen.queryByText("Available")).not.toBeInTheDocument();
  });
});
