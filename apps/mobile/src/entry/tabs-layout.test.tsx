import { render } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const useSessionState = vi.fn();
const useBootstrap = vi.fn();
const usePushRegistration = vi.fn();
const triggerIconMock = vi.fn();
const stackScreenMock = vi.fn();

vi.mock("react-native", async () => {
  const React = await import("react");

  return {
    AppState: {
      addEventListener: vi.fn(() => ({ remove: vi.fn() })),
    },
    Platform: {
      OS: "ios",
    },
    View: ({ children }: { children: React.ReactNode }) =>
      React.createElement("div", {}, children),
  };
});

vi.mock("@expo/vector-icons/Ionicons", () => ({
  default: {
    getImageSource: vi.fn(),
  },
}));

vi.mock("expo-router", async () => {
  const React = await import("react");
  const Stack = Object.assign(
    ({ children }: { children: React.ReactNode }) =>
      React.createElement("div", {}, children),
    {
      Screen: (props: Record<string, unknown>) => {
        stackScreenMock(props);
        return React.createElement("div");
      },
    },
  );

  return {
    Redirect: ({ href }: { href: string }) =>
      React.createElement("div", {}, `redirect:${href}`),
    Stack,
  };
});

vi.mock("expo-router/unstable-native-tabs", async () => {
  const React = await import("react");

  const NativeTabs = ({ children }: { children: React.ReactNode }) =>
    React.createElement("div", {}, children);

  const Trigger = ({ children }: { children: React.ReactNode }) =>
    React.createElement("div", {}, children);

  NativeTabs.Trigger = Trigger;

  const Label = ({ children }: { children: React.ReactNode }) =>
    React.createElement("span", {}, children);

  const Icon = (props: Record<string, unknown>) => {
    triggerIconMock(props);
    return React.createElement("div");
  };

  const VectorIcon = (props: Record<string, unknown>) =>
    React.createElement("div", props);

  return { Icon, Label, NativeTabs, VectorIcon };
});

vi.mock("../shared/components/LoadingScreen", async () => {
  const React = await import("react");

  return {
    LoadingScreen: ({ title }: { title: string }) =>
      React.createElement("div", {}, title),
  };
});

vi.mock("../shared/navigation/AlertsHeaderButton", async () => {
  const React = await import("react");

  return {
    AlertsHeaderButton: () => React.createElement("button", {}, "Open alerts"),
  };
});

vi.mock("../features/auth/hooks/useBootstrap", () => ({
  useBootstrap,
}));

vi.mock("../features/notifications/hooks/usePushRegistration", () => ({
  usePushRegistration,
}));

vi.mock("../shared/providers/AuthSessionProvider", () => ({
  useSessionState,
}));

let TabsLayout: (typeof import("../../app/(tabs)/_layout"))["default"];
let RequestsLayout: (typeof import("../../app/(tabs)/requests/_layout"))["default"];
let PeopleLayout: (typeof import("../../app/(tabs)/people/_layout"))["default"];
let ProfileLayout: (typeof import("../../app/(tabs)/profile/_layout"))["default"];

beforeAll(async () => {
  TabsLayout = (await import("../../app/(tabs)/_layout")).default;
  RequestsLayout = (await import("../../app/(tabs)/requests/_layout")).default;
  PeopleLayout = (await import("../../app/(tabs)/people/_layout")).default;
  ProfileLayout = (await import("../../app/(tabs)/profile/_layout")).default;
});

describe("TabsLayout", () => {
  beforeEach(() => {
    triggerIconMock.mockReset();
    stackScreenMock.mockReset();
    usePushRegistration.mockReset();
    useSessionState.mockReturnValue({
      accessToken: "token-123",
      isLoading: false,
    });
    useBootstrap.mockReturnValue({
      data: {
        currentOrg: { id: "org-123" },
        effectiveRole: "admin",
        permissions: {
          canApproveShiftRequests: true,
          canManageEmployees: true,
        },
      },
      refetch: vi.fn(),
    });
  });

  it("uses SF symbols on iOS and Android vector icon sources for the native tabs", () => {
    render(<TabsLayout />);

    expect(triggerIconMock).toHaveBeenCalledTimes(5);

    for (const [props] of triggerIconMock.mock.calls) {
      expect(props).toMatchObject({
        androidSrc: expect.any(Object),
        sf: expect.any(Object),
      });
      expect(props).not.toHaveProperty("src");
    }

    expect(triggerIconMock.mock.calls[0]?.[0]).toMatchObject({
      sf: { default: "person", selected: "person.fill" },
    });
  });

  it("uses native stack headers for request, people, and profile tab pages", () => {
    render(<RequestsLayout />);
    render(<PeopleLayout />);
    render(<ProfileLayout />);

    expect(stackScreenMock).toHaveBeenCalledTimes(3);
    const requestsOptions = stackScreenMock.mock.calls[0]?.[0].options;
    const peopleOptions = stackScreenMock.mock.calls[1]?.[0].options;
    const profileOptions = stackScreenMock.mock.calls[2]?.[0].options;

    expect(stackScreenMock.mock.calls[0]?.[0]).toMatchObject({
      name: "index",
      options: {
        headerLargeTitle: true,
        headerLargeTitleEnabled: true,
        headerStyle: undefined,
        title: "Requests",
      },
    });
    expect(requestsOptions).not.toHaveProperty("headerLargeStyle");
    expect(stackScreenMock.mock.calls[1]?.[0]).toMatchObject({
      name: "index",
      options: {
        headerLargeTitle: true,
        headerLargeTitleEnabled: true,
        headerStyle: undefined,
        title: "People",
      },
    });
    expect(peopleOptions).not.toHaveProperty("headerLargeStyle");
    expect(stackScreenMock.mock.calls[2]?.[0]).toMatchObject({
      name: "index",
      options: {
        headerLargeTitle: true,
        headerLargeTitleEnabled: true,
        headerStyle: undefined,
        headerRight: expect.any(Function),
        title: "Profile",
      },
    });
    expect(profileOptions).not.toHaveProperty("headerLargeStyle");
  });
});
