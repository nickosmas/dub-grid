import { fireEvent, render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";

function pickDomProps(input: Record<string, any>) {
  const output: Record<string, any> = {};

  for (const [key, value] of Object.entries(input)) {
    if (
      key === "children" ||
      key === "contentContainerStyle" ||
      key === "refreshControl" ||
      key === "style" ||
      key === "keyboardShouldPersistTaps" ||
      key === "contentInsetAdjustmentBehavior" ||
      key === "automaticallyAdjustContentInsets" ||
      key === "automaticallyAdjustsScrollIndicatorInsets" ||
      key === "keyboardDismissMode" ||
      key === "scrollEventThrottle" ||
      key === "onLayout"
    ) {
      continue;
    }

    if (key === "accessibilityLabel") {
      output["aria-label"] = value;
      continue;
    }

    if (key === "accessibilityRole") {
      output.role = value;
      continue;
    }

    if (key === "accessibilityState") {
      const state = value as { disabled?: boolean; selected?: boolean };
      if (state.disabled !== undefined) {
        output["aria-disabled"] = String(state.disabled);
      }
      if (state.selected !== undefined) {
        output["aria-selected"] = String(state.selected);
      }
      continue;
    }

    if (key === "testID") {
      output["data-testid"] = value;
      continue;
    }

    output[key] = value;
  }

  return output;
}

vi.mock("react-native", async () => {
  const React = await import("react");
  let layoutOffset = 0;

  const View = ({ children, onLayout, ...props }: Record<string, any>) => {
    const layoutYRef = React.useRef<number | null>(null);

    if (layoutYRef.current == null) {
      layoutYRef.current = layoutOffset;
      layoutOffset += 120;
    }

    React.useEffect(() => {
      onLayout?.({
        nativeEvent: {
          layout: {
            x: 0,
            y: layoutYRef.current ?? 0,
            width: 0,
            height: 100,
          },
        },
      });
    }, [onLayout]);

    return React.createElement("div", pickDomProps(props), children as React.ReactNode);
  };

  const Text = ({ children, ...props }: Record<string, any>) =>
    React.createElement("span", pickDomProps(props), children as React.ReactNode);

  const ScrollView = React.forwardRef<{ scrollTo: () => void }, Record<string, any>>(
    ({ children, contentContainerStyle, ...props }, ref) => {
      React.useImperativeHandle(
        ref,
        () => ({
          scrollTo: () => undefined,
        }),
        [],
      );

      return React.createElement(
        "div",
        {
          ...pickDomProps(props),
          "data-content-container-style": JSON.stringify(contentContainerStyle),
          "data-content-inset-adjustment-behavior": props.contentInsetAdjustmentBehavior,
          "data-automatically-adjust-content-insets": props.automaticallyAdjustContentInsets
            ? "true"
            : "false",
          "data-automatically-adjusts-scroll-indicator-insets":
            props.automaticallyAdjustsScrollIndicatorInsets ? "true" : "false",
          "data-keyboard-dismiss-mode": props.keyboardDismissMode,
          "data-testid": "screen-scroll-view",
        },
        children as React.ReactNode,
      );
    },
  );
  return {
    Platform: {
      OS: "ios",
    },
    RefreshControl: () => null,
    ScrollView,
    StyleSheet: {
      absoluteFillObject: {
        position: "absolute",
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
      },
      create: <T,>(value: T) => value,
    },
    Text,
    View,
  };
});

vi.mock("react-native-safe-area-context", async () => {
  const React = await import("react");

  return {
    SafeAreaProvider: ({ children }: { children: React.ReactNode }) =>
      React.createElement("div", {}, children),
    useSafeAreaInsets: () => ({
      top: 8,
      right: 0,
      bottom: 14,
      left: 0,
    }),
  };
});

let Screen: (typeof import("./Screen"))["Screen"];

beforeAll(async () => {
  Screen = (await import("./Screen")).Screen;
});

describe("Screen", () => {
  it("exposes the scroll view as the top-level element for native header scroll tracking", () => {
    const { container } = render(
      <Screen>
        <div>Content</div>
      </Screen>,
    );

    const scrollView = screen.getByTestId("screen-scroll-view");

    expect(container.firstElementChild).toBe(scrollView);
    expect(scrollView.getAttribute("data-content-inset-adjustment-behavior")).toBe("automatic");
    expect(scrollView.getAttribute("data-automatically-adjust-content-insets")).toBe("true");
    expect(scrollView.getAttribute("data-automatically-adjusts-scroll-indicator-insets")).toBe(
      "true",
    );
    expect(scrollView.getAttribute("data-keyboard-dismiss-mode")).toBe("interactive");
  });

  it("applies bottom padding modes to the scroll content container", () => {
    render(
      <Screen bottomPaddingMode="tabbed">
        <div>Content</div>
      </Screen>,
    );

    const scrollView = screen.getByTestId("screen-scroll-view");
    const contentStyle = JSON.parse(
      scrollView.getAttribute("data-content-container-style") ?? "{}",
    );

    expect(contentStyle.paddingBottom).toBe(86);
  });

  it("forwards scroll events to callers", () => {
    const handleScroll = vi.fn();

    render(
      <Screen onScroll={handleScroll} scrollEventThrottle={16}>
        <div>Content</div>
      </Screen>,
    );

    fireEvent.scroll(screen.getByTestId("screen-scroll-view"));

    expect(handleScroll).toHaveBeenCalledTimes(1);
  });

  it("keeps a stable root shell when a custom overlay is requested", () => {
    const { container } = render(
      <Screen renderOverlay={() => null}>
        <div>Content</div>
      </Screen>,
    );

    const scrollView = screen.getByTestId("screen-scroll-view");

    expect(container.firstElementChild).not.toBe(scrollView);
    expect(container.firstElementChild?.contains(scrollView)).toBe(true);
  });

  it("renders overlays with the measured sticky header height", () => {
    render(
      <Screen
        renderOverlay={({ stickyHeaderHeight }) => <span>{`Overlay ${stickyHeaderHeight}`}</span>}
        stickyHeader={<span>Header</span>}
      >
        <div>Body</div>
      </Screen>,
    );

    expect(screen.getByText("Overlay 100")).toBeInTheDocument();
  });
});
