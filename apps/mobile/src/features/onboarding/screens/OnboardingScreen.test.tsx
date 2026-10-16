import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createReactNativeModule,
  createSafeAreaContextModule,
  screenScrollToMock,
} from "../../../test/native";

const routerReplace = vi.fn();
const markHasSeenOnboarding = vi.fn(() => Promise.resolve());
const getPushPermissionState = vi.fn();
const requestPushPermission = vi.fn();

vi.mock("react-native", async () => createReactNativeModule(await import("react")));

vi.mock("react-native-safe-area-context", async () =>
  createSafeAreaContextModule(await import("react")),
);

vi.mock("@expo/vector-icons/Ionicons", () => ({
  default: () => null,
}));

vi.mock("expo-router", () => ({
  router: {
    replace: routerReplace,
  },
}));

// Goes through the hook, not straight to storage: it writes the new value
// into the query cache too, so the launch gate and index route don't keep
// reading a stale first-run flag for the rest of the session.
vi.mock("../../auth/hooks/useHasSeenOnboarding", () => ({
  markHasSeenOnboarding,
}));

vi.mock("../../notifications/lib/push-permission", () => ({
  getPushPermissionState: (...a: unknown[]) => getPushPermissionState(...a),
  requestPushPermission: (...a: unknown[]) => requestPushPermission(...a),
}));

// The previews render the real Home and Requests components, whose screen
// modules pull in queries, routing and gestures this test does not stand up.
// `OnboardingPreviews.test.tsx` covers what they show.
vi.mock("../components/previews/UpcomingShiftPreview", () => ({
  UpcomingShiftPreview: () => null,
}));
vi.mock("../components/previews/CoverShiftsPreview", () => ({
  CoverShiftsPreview: () => null,
}));
vi.mock("../components/WelcomeVisual", () => ({
  WelcomeVisual: () => null,
}));

let OnboardingScreen: (typeof import("./OnboardingScreen"))["default"];
let windowWidth = 0;

beforeAll(async () => {
  OnboardingScreen = (await import("./OnboardingScreen")).default;
  // Imported here rather than at the top: a static react-native import would
  // evaluate its mock before the harness module the factory reads from.
  windowWidth = (await import("react-native")).Dimensions.get("window").width;
});

const SLIDE_COUNT = 4;

// The screen reads the device's notification answer on mount; flushing that
// inside `act` keeps the state update out of the "not wrapped in act" log.
async function renderScreen() {
  render(<OnboardingScreen />);
  await act(async () => {});
}

// The emulated ScrollView treats one DOM scroll event as a settled swipe and
// reads the landing offset from `data-scroll-x`.
function swipeToLastSlide() {
  const pager = screen.getByTestId("onboarding-pager");
  pager.dataset.scrollX = String((SLIDE_COUNT - 1) * windowWidth);
  fireEvent.scroll(pager);
}

describe("OnboardingScreen", () => {
  beforeEach(() => {
    routerReplace.mockReset();
    screenScrollToMock.mockClear();
    markHasSeenOnboarding.mockClear();
    getPushPermissionState.mockReset();
    requestPushPermission.mockReset();
    getPushPermissionState.mockResolvedValue("unsupported");
    requestPushPermission.mockResolvedValue("granted");
  });

  it("opens on a welcome step, then the tour, then the notification step", async () => {
    await renderScreen();

    const titles = screen.getAllByRole("header").map((heading) => heading.textContent);
    expect(titles).toEqual([
      "Welcome to DubGrid",
      "Your schedule, always with you",
      "Cover shifts on the go",
      "Know when things change",
    ]);
  });

  it("renders every slide", async () => {
    await renderScreen();

    expect(screen.getByText("Your schedule, always with you")).toBeInTheDocument();
    expect(screen.getByText("Cover shifts on the go")).toBeInTheDocument();
    expect(screen.getByText("Know when things change")).toBeInTheDocument();
  });

  // The permission step has to say what the prompt is for, in terms of the
  // categories the person can later switch off, not a one-line promise.
  it("the notification step lists what the permission is for", async () => {
    await renderScreen();

    expect(screen.getByText("Schedule updates")).toBeInTheDocument();
    expect(screen.getByText("Shift requests")).toBeInTheDocument();
    expect(screen.getByText("Account and sign-in")).toBeInTheDocument();
  });

  it("Skip persists the seen flag and routes to login when there is nothing to ask", async () => {
    await renderScreen();

    fireEvent.click(screen.getByRole("button", { name: "Skip" }));

    await vi.waitFor(() => {
      expect(markHasSeenOnboarding).toHaveBeenCalledWith(true);
    });
    expect(routerReplace).toHaveBeenCalledWith("/(auth)/login");
  });

  it("starts on the first slide with an advance action, not a finish action", async () => {
    await renderScreen();

    expect(screen.getByRole("button", { name: "Continue" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Get started" })).not.toBeInTheDocument();
  });

  // The primary button doubles as advance and finish. If it ever completed on
  // the first slide, every new user would be dropped straight onto login and
  // never see the value props — and the flag is device-local, so they would
  // never be shown them again either.
  it("Continue advances instead of completing onboarding", async () => {
    await renderScreen();

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect(markHasSeenOnboarding).not.toHaveBeenCalled();
    expect(routerReplace).not.toHaveBeenCalled();
  });

  // A programmatic scroll does not reliably report where it landed, so
  // Continue must move the tour on by itself, all the way to the end.
  it("Continue walks every slide without waiting for a scroll event", async () => {
    await renderScreen();

    for (let index = 1; index < SLIDE_COUNT; index += 1) {
      fireEvent.click(screen.getByRole("button", { name: "Continue" }));
      expect(screenScrollToMock).toHaveBeenLastCalledWith({
        x: index * windowWidth,
        animated: true,
      });
    }

    expect(screen.getByRole("button", { name: "Get started" })).toBeInTheDocument();
  });

  it("finishes with Get started when the device cannot show the notification prompt", async () => {
    getPushPermissionState.mockResolvedValue("denied");
    await renderScreen();

    swipeToLastSlide();

    expect(await screen.findByRole("button", { name: "Get started" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Enable notifications" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Not now" })).not.toBeInTheDocument();
  });

  describe("when the device has not answered the notification prompt yet", () => {
    beforeEach(() => {
      getPushPermissionState.mockResolvedValue("undetermined");
    });

    it("asks on the last slide instead of finishing outright", async () => {
      await renderScreen();

      swipeToLastSlide();

      expect(
        await screen.findByRole("button", { name: "Enable notifications" }),
      ).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Not now" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Get started" })).not.toBeInTheDocument();
    });

    // Skipping the tour must not skip the one decision in it: the OS prompt
    // can only be shown with context from here.
    it("Skip goes to the notification step instead of leaving", async () => {
      await renderScreen();

      fireEvent.click(screen.getByRole("button", { name: "Skip" }));

      expect(screenScrollToMock).toHaveBeenCalledWith({
        x: (SLIDE_COUNT - 1) * windowWidth,
        animated: true,
      });
      expect(markHasSeenOnboarding).not.toHaveBeenCalled();
      expect(routerReplace).not.toHaveBeenCalled();
    });

    it("drops Skip on the notification step, where Not now finishes", async () => {
      await renderScreen();
      swipeToLastSlide();

      await screen.findByRole("button", { name: "Not now" });
      expect(screen.queryByRole("button", { name: "Skip" })).not.toBeInTheDocument();
    });

    it("keeps the ask off the earlier slides", async () => {
      await renderScreen();

      expect(getPushPermissionState).toHaveBeenCalled();
      expect(screen.getByRole("button", { name: "Continue" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Not now" })).not.toBeInTheDocument();
    });

    // The system prompt has to be answered before the route changes: the
    // login screen replacing the tour mid-prompt would leave the answer
    // attached to a screen that is gone.
    it("Enable notifications shows the system prompt, then moves on to login", async () => {
      await renderScreen();
      swipeToLastSlide();
      const enable = await screen.findByRole("button", { name: "Enable notifications" });

      // `act` so the button's own busy state settles inside the test.
      await act(async () => {
        fireEvent.click(enable);
      });

      expect(routerReplace).toHaveBeenCalledWith("/(auth)/login");
      expect(requestPushPermission).toHaveBeenCalledTimes(1);
      expect(markHasSeenOnboarding).toHaveBeenCalledWith(true);
      expect(requestPushPermission.mock.invocationCallOrder[0]).toBeLessThan(
        markHasSeenOnboarding.mock.invocationCallOrder[0]!,
      );
    });

    it("Not now moves on to login without prompting", async () => {
      await renderScreen();
      swipeToLastSlide();

      fireEvent.click(await screen.findByRole("button", { name: "Not now" }));

      await vi.waitFor(() => {
        expect(routerReplace).toHaveBeenCalledWith("/(auth)/login");
      });
      expect(requestPushPermission).not.toHaveBeenCalled();
      expect(markHasSeenOnboarding).toHaveBeenCalledWith(true);
    });

    it("a failed prompt still finishes onboarding", async () => {
      requestPushPermission.mockRejectedValue(new Error("native module unavailable"));
      await renderScreen();
      swipeToLastSlide();
      const enable = await screen.findByRole("button", { name: "Enable notifications" });

      await act(async () => {
        fireEvent.click(enable);
      });

      expect(routerReplace).toHaveBeenCalledWith("/(auth)/login");
      expect(markHasSeenOnboarding).toHaveBeenCalledWith(true);
    });
  });
});
