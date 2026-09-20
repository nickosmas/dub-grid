import { fireEvent, render, screen } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NativeTabBarPresenceProvider } from "../navigation/NativeTabBarPresence";

const nativeScrollTo = vi.fn();
const nativeScrollToOffset = vi.fn();
// Mutable so a test can stand the screen under a real notch. The default 8 is
// deliberately small: it is also the floor the sticky header pads by, so a test
// that wants to see the inset applied has to raise it first.
const safeAreaInsets = vi.hoisted(() => ({ top: 8, right: 0, bottom: 14, left: 0 }));

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
      key === "onLayout" ||
      key === "contentInset" ||
      key === "contentOffset"
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

  const View = ({ children, onLayout, style, ...props }: Record<string, any>) => {
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

    return React.createElement(
      "div",
      { ...pickDomProps(props), "data-style": JSON.stringify(style ?? null) },
      children as React.ReactNode,
    );
  };

  const Text = ({ children, ...props }: Record<string, any>) =>
    React.createElement("span", pickDomProps(props), children as React.ReactNode);

  const ScrollView = React.forwardRef<{ scrollTo: () => void }, Record<string, any>>(
    (
      { children, contentContainerStyle, contentInset, contentOffset, refreshControl, ...props },
      ref,
    ) => {
      React.useImperativeHandle(
        ref,
        () => ({
          scrollTo: nativeScrollTo,
        }),
        [],
      );

      // iOS mounts the refresh control as the scroll view's first child,
      // ahead of the content container; the tests below rely on that shape.
      return React.createElement(
        "div",
        {
          ...pickDomProps(props),
          "data-content-container-style": JSON.stringify(contentContainerStyle),
          "data-content-inset": JSON.stringify(contentInset ?? null),
          "data-content-offset": JSON.stringify(contentOffset ?? null),
          "data-content-inset-adjustment-behavior": props.contentInsetAdjustmentBehavior,
          "data-automatically-adjust-content-insets": props.automaticallyAdjustContentInsets
            ? "true"
            : "false",
          "data-automatically-adjusts-scroll-indicator-insets":
            props.automaticallyAdjustsScrollIndicatorInsets ? "true" : "false",
          "data-always-bounce-horizontal": props.alwaysBounceHorizontal ? "true" : "false",
          "data-directional-lock-enabled": props.directionalLockEnabled ? "true" : "false",
          "data-keyboard-dismiss-mode": props.keyboardDismissMode,
          "data-testid": "screen-scroll-view",
        },
        refreshControl as React.ReactNode,
        children as React.ReactNode,
      );
    },
  );
  const Pressable = ({ children, onPress, disabled, style, ...props }: Record<string, any>) =>
    React.createElement(
      "button",
      {
        type: "button",
        disabled,
        onClick: onPress as (() => void) | undefined,
        ...pickDomProps(props),
        "data-style": JSON.stringify(
          typeof style === "function" ? style({ pressed: false }) : (style ?? null),
        ),
      },
      children as React.ReactNode,
    );

  // Renders every item so list-mode tests can assert the header/items/footer
  // order and the shared scroll props; virtualization itself is native.
  const FlatList = React.forwardRef<{ scrollToOffset: () => void }, Record<string, any>>(
    (
      {
        data,
        renderItem,
        keyExtractor,
        ListHeaderComponent,
        ListHeaderComponentStyle,
        ListFooterComponent,
        ItemSeparatorComponent,
        contentContainerStyle,
        refreshControl,
        ...props
      },
      ref,
    ) => {
      React.useImperativeHandle(ref, () => ({ scrollToOffset: nativeScrollToOffset }), []);
      const items = (data as unknown[]).map((item, index) =>
        React.createElement(
          React.Fragment,
          { key: keyExtractor(item, index) },
          index > 0 && ItemSeparatorComponent ? React.createElement(ItemSeparatorComponent) : null,
          renderItem({ item, index }),
        ),
      );
      return React.createElement(
        "div",
        {
          ...pickDomProps(props),
          "data-content-container-style": JSON.stringify(contentContainerStyle),
          "data-content-inset-adjustment-behavior": props.contentInsetAdjustmentBehavior,
          "data-testid": "screen-flat-list",
        },
        refreshControl as React.ReactNode,
        React.createElement(
          "div",
          {
            "data-testid": "screen-list-header",
            "data-style": JSON.stringify(ListHeaderComponentStyle ?? null),
          },
          ListHeaderComponent as React.ReactNode,
        ),
        ...items,
        ListFooterComponent as React.ReactNode,
      );
    },
  );

  return {
    FlatList,
    Platform: {
      OS: "ios",
    },
    Pressable,
    RefreshControl: ({ enabled, refreshing }: Record<string, any>) =>
      React.createElement("div", {
        "data-testid": "refresh-control",
        "data-enabled": String(enabled ?? true),
        "data-refreshing": String(refreshing),
      }),
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

vi.mock("@expo/vector-icons/Ionicons", () => ({
  default: () => null,
}));

vi.mock("react-native-safe-area-context", async () => {
  const React = await import("react");

  return {
    SafeAreaProvider: ({ children }: { children: React.ReactNode }) =>
      React.createElement("div", {}, children),
    useSafeAreaInsets: () => ({ ...safeAreaInsets }),
  };
});

let Screen: (typeof import("./Screen"))["Screen"];
let Card: (typeof import("./Screen"))["Card"];

beforeAll(async () => {
  const screenModule = await import("./Screen");
  Screen = screenModule.Screen;
  Card = screenModule.Card;
});

/** The sticky-header shell is the View wrapping whatever `stickyHeader` renders. */
function getStickyHeaderShellPaddingTop(): number | undefined {
  const shell = screen.getByText("Header").parentElement;
  const style = JSON.parse(shell?.getAttribute("data-style") ?? "null") as unknown;
  const layers = Array.isArray(style) ? style : [style];
  return layers.reduce<number | undefined>((found, layer) => {
    const value = (layer as { paddingTop?: number } | null)?.paddingTop;
    return typeof value === "number" ? value : found;
  }, undefined);
}

describe("Screen", () => {
  beforeEach(() => {
    nativeScrollTo.mockClear();
    safeAreaInsets.top = 8;
  });

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
    expect(scrollView.getAttribute("data-always-bounce-horizontal")).toBe("false");
    expect(scrollView.getAttribute("data-directional-lock-enabled")).toBe("true");
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

  it("renders a footer as a shallow sibling of the scroll view, not inside or wrapping it", () => {
    const { container } = render(
      <Screen footer={<span>Footer content</span>}>
        <div>Content</div>
      </Screen>,
    );

    const scrollView = screen.getByTestId("screen-scroll-view");
    const footerText = screen.getByText("Footer content");

    expect(scrollView.contains(footerText)).toBe(false);
    // Supplying only `footer` (no stickyHeader/renderOverlay) must keep the
    // scroll view a top-level element rather than nesting it inside an extra
    // wrapping View — iOS's native large-title collapse only tracks a scroll
    // view that shallow, and an intervening wrapper silently breaks it.
    expect(container.firstElementChild).toBe(scrollView);
    expect(container.contains(footerText)).toBe(true);
  });

  it("gives scroll content a small gap instead of the full bottom-padding clearance once a footer takes over that job", () => {
    render(
      <Screen bottomPaddingMode="tabbed" footer={<span>Footer content</span>}>
        <div>Content</div>
      </Screen>,
    );

    const scrollView = screen.getByTestId("screen-scroll-view");
    const contentStyle = JSON.parse(
      scrollView.getAttribute("data-content-container-style") ?? "{}",
    );

    // 16 (mobileSpace.lg), not the 86 the same bottomPaddingMode produces with
    // no footer (see "applies bottom padding modes..." above) — the footer
    // now carries that clearance instead.
    expect(contentStyle.paddingBottom).toBe(16);
  });

  it("gives a tab-hidden footer only safe-area and breathing-room clearance", () => {
    render(
      <Screen bottomPaddingMode="tabbed" footer={<span>Footer content</span>}>
        <div>Content</div>
      </Screen>,
    );

    const footerText = screen.getByText("Footer content");
    const footerNode = footerText.parentElement;
    const footerStyle = JSON.parse(footerNode?.getAttribute("data-style") ?? "null");

    // This test is outside the iOS tab-layout provider, so only the 14pt
    // physical safe area and 16pt breathing room belong below the footer.
    expect(footerStyle).toEqual(
      expect.arrayContaining([expect.objectContaining({ paddingBottom: 30 })]),
    );
  });

  it("clears the native iOS tab bar for nested routes regardless of padding mode", () => {
    render(
      <NativeTabBarPresenceProvider>
        <Screen bottomPaddingMode="stack" footer={<span>Footer content</span>}>
          <div>Content</div>
        </Screen>
      </NativeTabBarPresenceProvider>,
    );

    const footerNode = screen.getByText("Footer content").parentElement;
    const footerStyle = JSON.parse(footerNode?.getAttribute("data-style") ?? "null");

    // 14pt safe area + UIKit's 49pt tab-bar content + 16pt breathing room.
    expect(footerStyle).toEqual(
      expect.arrayContaining([expect.objectContaining({ paddingBottom: 79 })]),
    );
  });

  it("renders a virtualized list with the children as its header", () => {
    const scrollViewRef = { current: null } as {
      current: { scrollTo: (o: unknown) => void } | null;
    };
    render(
      <Screen
        list={{
          data: ["a", "b", "c"],
          keyExtractor: (item) => item,
          renderItem: (item) => <span>row {item}</span>,
          itemSeparator: <hr />,
          listFooter: <span>Load more</span>,
        }}
        onRefresh={() => undefined}
        scrollViewRef={scrollViewRef as never}
      >
        <div>Search</div>
      </Screen>,
    );

    const list = screen.getByTestId("screen-flat-list");
    expect(screen.queryByTestId("screen-scroll-view")).toBeNull();
    expect(list.getAttribute("data-content-inset-adjustment-behavior")).toBe("automatic");
    expect(JSON.parse(list.getAttribute("data-content-container-style") ?? "{}")).toMatchObject({
      flexGrow: 1,
    });
    // Header, rows in order with separators between them, footer last.
    const text = list.textContent ?? "";
    expect(text.indexOf("Search")).toBeLessThan(text.indexOf("row a"));
    expect(text.indexOf("row c")).toBeLessThan(text.indexOf("Load more"));
    expect(list.querySelectorAll("hr")).toHaveLength(2);
    expect(screen.getByTestId("refresh-control")).toBeInTheDocument();
    // The header does not stretch while there are rows.
    expect(screen.getByTestId("screen-list-header").getAttribute("data-style")).toBe("null");

    scrollViewRef.current?.scrollTo({ y: 40, animated: false });
    expect(nativeScrollToOffset).toHaveBeenCalledWith({ offset: 40, animated: false });
  });

  it("lets a fillScreen state in the header claim the page when the list is empty", () => {
    render(
      <Screen list={{ data: [], keyExtractor: (item: string) => item, renderItem: () => null }}>
        <div>Nothing here</div>
      </Screen>,
    );

    expect(
      JSON.parse(screen.getByTestId("screen-list-header").getAttribute("data-style") ?? "null"),
    ).toMatchObject({ flexGrow: 1 });
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

  it("keeps the page mounted when scrolling is locked for a skeleton", () => {
    const { rerender } = render(
      <Screen onRefresh={vi.fn()} scrollEnabled>
        <div>Body</div>
      </Screen>,
    );
    const body = screen.getByText("Body");
    expect(screen.getByTestId("refresh-control")).toHaveAttribute("data-enabled", "true");

    rerender(
      <Screen onRefresh={vi.fn()} scrollEnabled={false}>
        <div>Body</div>
      </Screen>,
    );

    // The refresh control is the scroll view's first child on iOS. Dropping it
    // for the skeleton moved the content to that slot and React remounted
    // everything in it, a presented sheet included. It stays, disarmed.
    expect(screen.getByTestId("refresh-control")).toHaveAttribute("data-enabled", "false");
    expect(screen.getByText("Body")).toBe(body);
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

  it("renders a page background behind everything and lets the sticky header paint its own slice", () => {
    render(
      <Screen
        pageBackground={<span>Page wash</span>}
        stickyHeader={<span>Header</span>}
        stickyHeaderBackground={<span>Header wash</span>}
      >
        <div>Body</div>
      </Screen>,
    );

    expect(screen.getByText("Page wash")).toBeInTheDocument();
    // The header's wash lives inside the header's shell, next to its content,
    // so content scrolling under the header never shows through.
    expect(screen.getByText("Header wash").parentElement).toBe(
      screen.getByText("Header").parentElement,
    );
  });

  it("pads a non-scrolling sticky header by the top safe-area inset, the same as the floating one", () => {
    safeAreaInsets.top = 59;

    const { unmount } = render(
      <Screen scrollEnabled={false} stickyHeader={<span>Header</span>}>
        <div>Skeleton</div>
      </Screen>,
    );
    const nonScrollingPadding = getStickyHeaderShellPaddingTop();
    unmount();

    render(
      <Screen stickyHeader={<span>Header</span>}>
        <div>Body</div>
      </Screen>,
    );

    expect(nonScrollingPadding).toBe(59);
    expect(getStickyHeaderShellPaddingTop()).toBe(nonScrollingPadding);
  });

  it("keeps the sticky header off the top edge on a device with no inset", () => {
    safeAreaInsets.top = 0;

    render(
      <Screen scrollEnabled={false} stickyHeader={<span>Header</span>}>
        <div>Skeleton</div>
      </Screen>,
    );

    expect(getStickyHeaderShellPaddingTop()).toBe(8);
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

  it("uses a native content inset/offset instead of padding to clear the sticky header on iOS, so pull-to-refresh isn't hidden behind it", () => {
    render(
      <Screen refreshing={false} onRefresh={() => undefined} stickyHeader={<span>Header</span>}>
        <div>Body</div>
      </Screen>,
    );

    const scrollView = screen.getByTestId("screen-scroll-view");
    const contentStyle = JSON.parse(
      scrollView.getAttribute("data-content-container-style") ?? "{}",
    );

    // The mocked header's onLayout reports height: 100 (see the View mock
    // above) — that value should drive a native inset/offset, not a JS
    // paddingTop, since paddingTop doesn't move the ScrollView's own frame
    // origin that the RefreshControl's pull reveal is anchored to.
    expect(JSON.parse(scrollView.getAttribute("data-content-inset") ?? "null")).toEqual({
      top: 100,
      left: 0,
      bottom: 0,
      right: 0,
    });
    expect(JSON.parse(scrollView.getAttribute("data-content-offset") ?? "null")).toEqual({
      x: 0,
      y: -100,
    });
    expect(contentStyle.paddingTop).toBe(0);
  });

  it("translates an imperative scrollTo(y: 0) via scrollViewRef to sit below the sticky header on iOS", () => {
    const scrollViewRef: {
      current: { scrollTo: (opts: { y?: number; animated?: boolean }) => void } | null;
    } = { current: null };

    render(
      <Screen scrollViewRef={scrollViewRef as any} stickyHeader={<span>Header</span>}>
        <div>Body</div>
      </Screen>,
    );

    // A caller scrolling "to the top" (y: 0) — e.g. ScheduleScreen resetting
    // position when the visible date range changes — must not land content
    // behind the floating header: on iOS the header is implemented via
    // contentInset, so the true top of content is native y: -headerHeight,
    // not y: 0. The mocked header's onLayout reports height: 100.
    scrollViewRef.current?.scrollTo({ y: 0, animated: true });

    expect(nativeScrollTo).toHaveBeenCalledWith({ y: -100, animated: true });
  });

  it("self-corrects position the moment the sticky header's height is first measured, with no caller involved", () => {
    // Regression for a race where a caller's scrollTo(y: 0) fires before the
    // header's onLayout has reported a height (e.g. on a warm cache, where
    // data — and so a caller's own "scroll to top" effect — can resolve in
    // the same tick as mount, ahead of this native layout callback). At that
    // moment there's nothing yet to subtract, so the translated call is a
    // no-op, leaving content under the header with no visible correction.
    // Screen itself must self-correct once the real height becomes known,
    // regardless of whether any caller already (ineffectively) tried.
    render(
      <Screen stickyHeader={<span>Header</span>}>
        <div>Body</div>
      </Screen>,
    );

    expect(nativeScrollTo).toHaveBeenCalledWith({ x: 0, y: -100, animated: false });
  });
});

describe("Card", () => {
  it("renders a header-right See all control that calls back", () => {
    const onSeeAll = vi.fn();
    render(<Card title="Open shifts" onSeeAll={onSeeAll} />);

    fireEvent.click(screen.getByRole("button", { name: "See all: Open shifts" }));

    expect(onSeeAll).toHaveBeenCalledTimes(1);
  });

  it("renders the title and body", () => {
    render(<Card title="Plain card" body="Some body text" />);

    expect(screen.getByText("Plain card")).toBeInTheDocument();
    expect(screen.getByText("Some body text")).toBeInTheDocument();
  });

  it("renders header accessory content", () => {
    render(<Card title="With accessory" headerAccessory={<span>Badge</span>} />);

    expect(screen.getByText("Badge")).toBeInTheDocument();
  });
});
