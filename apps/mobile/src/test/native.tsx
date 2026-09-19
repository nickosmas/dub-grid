import type * as ReactType from "react";
import { vi } from "vitest";

type ReactModule = typeof ReactType;

export const screenScrollToMock = vi.fn();
export const alertMock = vi.fn();
export const keyboardDismissMock = vi.fn();
export const announceForAccessibilityMock = vi.fn();

/**
 * Live `Keyboard.addListener` subscriptions, so a test can drive the keyboard.
 * The real events come from the platform, and a hook that answers them has no
 * other way to be exercised.
 */
const keyboardListeners = new Map<string, Set<(event: unknown) => void>>();

/** Names the component under test is currently subscribed to, in order. */
export function subscribedKeyboardEvents(): string[] {
  return [...keyboardListeners].filter(([, handlers]) => handlers.size > 0).map(([name]) => name);
}

export function emitKeyboardEvent(name: string, event: unknown = {}): void {
  for (const handler of [...(keyboardListeners.get(name) ?? [])]) handler(event);
}

function pickDomProps(input: Record<string, any>) {
  const output: Record<string, any> = {};

  for (const [key, value] of Object.entries(input)) {
    if (
      key === "children" ||
      key === "contentContainerStyle" ||
      key === "keyboardShouldPersistTaps" ||
      key === "keyboardDismissMode" ||
      key === "keyboardType" ||
      key === "blurOnSubmit" ||
      key === "placeholderTextColor" ||
      key === "returnKeyType" ||
      key === "textContentType" ||
      key === "autoCorrect" ||
      key === "editable" ||
      key === "multiline" ||
      key === "refreshControl" ||
      key === "style" ||
      key === "hitSlop" ||
      key === "animationType" ||
      key === "presentationStyle" ||
      key === "navigationBarTranslucent" ||
      key === "statusBarTranslucent" ||
      key === "bounces" ||
      key === "transparent" ||
      key === "visible" ||
      key === "onRequestClose" ||
      key === "allowSwipeDismissal" ||
      key === "horizontal" ||
      key === "showsHorizontalScrollIndicator" ||
      key === "showsVerticalScrollIndicator" ||
      key === "contentInsetAdjustmentBehavior" ||
      key === "automaticallyAdjustContentInsets" ||
      key === "automaticallyAdjustsScrollIndicatorInsets" ||
      key === "scrollEventThrottle" ||
      key === "stickyHeaderIndices" ||
      key === "onStartShouldSetResponder" ||
      key === "onLayout" ||
      key === "onResponderGrant" ||
      key === "onResponderRelease" ||
      key === "pointerEvents" ||
      key === "maxFontSizeMultiplier" ||
      key === "accessibilityIgnoresInvertColors" ||
      key === "android_ripple"
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
      if (value == null) {
        continue;
      }
      const state = value as {
        busy?: boolean;
        checked?: boolean;
        disabled?: boolean;
        expanded?: boolean;
        selected?: boolean;
      };
      if (state.checked !== undefined) {
        output["aria-checked"] = String(state.checked);
      }
      if (state.busy !== undefined) {
        output["aria-busy"] = String(state.busy);
      }
      if (state.disabled !== undefined) {
        output["aria-disabled"] = String(state.disabled);
      }
      if (state.expanded !== undefined) {
        output["aria-expanded"] = String(state.expanded);
      }
      if (state.selected !== undefined) {
        output["aria-selected"] = String(state.selected);
      }
      continue;
    }

    if (key === "accessibilityValue") {
      if (value == null) {
        continue;
      }
      const accessibilityValue = value as {
        min?: number;
        max?: number;
        now?: number;
        text?: string;
      };
      if (accessibilityValue.min !== undefined) {
        output["aria-valuemin"] = accessibilityValue.min;
      }
      if (accessibilityValue.max !== undefined) {
        output["aria-valuemax"] = accessibilityValue.max;
      }
      if (accessibilityValue.now !== undefined) {
        output["aria-valuenow"] = accessibilityValue.now;
      }
      if (accessibilityValue.text !== undefined) {
        output["aria-valuetext"] = accessibilityValue.text;
      }
      continue;
    }

    if (key === "testID") {
      output["data-testid"] = value;
      continue;
    }

    if (key === "numberOfLines") {
      output["data-number-of-lines"] = String(value);
      continue;
    }

    if (key === "adjustsFontSizeToFit") {
      output["data-adjusts-font-size-to-fit"] = String(value);
      continue;
    }

    if (key === "minimumFontScale") {
      output["data-minimum-font-scale"] = String(value);
      continue;
    }

    if (key === "allowFontScaling") {
      output["data-allow-font-scaling"] = String(value);
      continue;
    }

    if (key === "ellipsizeMode") {
      output["data-ellipsize-mode"] = String(value);
      continue;
    }

    // Kept (rather than dropped) so tests can assert which accessory view a
    // field is wired to, but renamed so React doesn't warn about the casing.
    if (key === "inputAccessoryViewID") {
      if (value != null) {
        output["data-input-accessory-view-id"] = value;
      }
      continue;
    }

    output[key] = value;
  }

  return output;
}

export function createReactNativeModule(
  React: ReactModule,
  options: { platformOS?: "ios" | "android" } = {},
) {
  const platformOS = options.platformOS ?? "ios";
  let layoutOffset = 0;
  const View = React.forwardRef<unknown, Record<string, any>>(
    ({ children, onLayout, ...props }, ref) => {
      const layoutYRef = React.useRef<number | null>(null);

      if (layoutYRef.current == null) {
        layoutYRef.current = layoutOffset;
        layoutOffset += 120;
      }

      // Native measurement, stubbed. Without this a ref'd View resolves to the
      // underlying DOM node, which has no `measureInWindow`, and anything that
      // measures itself (the skeleton shimmer reads its own window x) throws
      // during the layout effect.
      React.useImperativeHandle(
        ref,
        () => ({
          measureInWindow: (
            callback: (x: number, y: number, width: number, height: number) => void,
          ) => callback(0, layoutYRef.current ?? 0, 0, 100),
          measure: (
            callback: (
              x: number,
              y: number,
              width: number,
              height: number,
              pageX: number,
              pageY: number,
            ) => void,
          ) => callback(0, 0, 0, 100, 0, layoutYRef.current ?? 0),
        }),
        [],
      );

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

      return React.createElement("div", pickDomProps(props), children as ReactType.ReactNode);
    },
  );
  const Text = ({ children, ...props }: Record<string, any>) =>
    React.createElement("span", pickDomProps(props), children as ReactType.ReactNode);
  const ScrollView = React.forwardRef<{ scrollTo: typeof screenScrollToMock }, Record<string, any>>(
    ({ children, ...props }, ref) => {
      React.useImperativeHandle(
        ref,
        () => ({
          scrollTo: screenScrollToMock,
        }),
        [],
      );

      return React.createElement(
        "div",
        {
          ...pickDomProps(props),
          "data-keyboard-dismiss-mode": props.keyboardDismissMode,
        },
        children as ReactType.ReactNode,
      );
    },
  );
  const KeyboardAvoidingView = ({ children, ...props }: Record<string, any>) =>
    React.createElement("div", pickDomProps(props), children as ReactType.ReactNode);
  // The real view renders above the keyboard rather than inline, but keeping
  // its children in the tree lets tests assert the Done affordance exists.
  const InputAccessoryView = ({
    children,
    nativeID,
    backgroundColor: _backgroundColor,
    ...props
  }: Record<string, any>) =>
    React.createElement(
      "div",
      { ...pickDomProps(props), "data-native-id": nativeID },
      children as ReactType.ReactNode,
    );
  const Image = ({ source, ...props }: Record<string, any>) =>
    React.createElement("img", {
      alt: props.accessibilityLabel ?? "",
      ...pickDomProps(props),
    });
  const SafeAreaView = ({ children, ...props }: Record<string, any>) =>
    React.createElement("div", pickDomProps(props), children as ReactType.ReactNode);
  // forwardRef so `Animated.createAnimatedComponent(Pressable)` can hand it a
  // ref without React warning about a function component receiving one.
  const Pressable = React.forwardRef<HTMLButtonElement, Record<string, any>>(function Pressable(
    { children, onPress, onPressIn, onPressOut, disabled, ...props },
    ref,
  ) {
    return React.createElement(
      "button",
      {
        ref,
        type: "button",
        disabled,
        onClick: onPress as (() => void) | undefined,
        // Mapped to mouse down/up so press *feedback* is testable: the press
        // animation and its haptic both fire on press-in, not on press.
        onMouseDown: disabled ? undefined : (onPressIn as (() => void) | undefined),
        onMouseUp: disabled ? undefined : (onPressOut as (() => void) | undefined),
        ...pickDomProps(props),
      },
      children as ReactType.ReactNode,
    );
  });
  const TextInput = React.forwardRef<
    HTMLInputElement,
    Record<string, any> & {
      onChangeText?: (value: string) => void;
      onSubmitEditing?: (event: { nativeEvent: { text: string } }) => void;
      secureTextEntry?: boolean;
    }
  >(({ onChangeText, onSubmitEditing, secureTextEntry, ...props }, ref) => {
    const domProps = pickDomProps(props);

    return React.createElement("input", {
      ref,
      type: secureTextEntry ? "password" : "text",
      value: (props.value as string | undefined) ?? "",
      onChange: (event: Event) => {
        const target = event.target as HTMLInputElement | null;
        onChangeText?.(target?.value ?? "");
      },
      onKeyDown: (event: KeyboardEvent) => {
        const target = event.target as HTMLInputElement | null;
        if (event.key === "Enter") {
          onSubmitEditing?.({
            nativeEvent: {
              text: target?.value ?? "",
            },
          });
        }
      },
      ...domProps,
    });
  });
  const Switch = ({ value, onValueChange, disabled, ...props }: Record<string, any>) =>
    React.createElement("input", {
      type: "checkbox",
      role: "switch",
      checked: Boolean(value),
      disabled,
      onChange: (event: Event) => {
        const target = event.target as HTMLInputElement | null;
        onValueChange?.(Boolean(target?.checked));
      },
      ...pickDomProps(props),
    });
  const Modal = ({ children, visible = true, ...props }: Record<string, any>) =>
    visible
      ? React.createElement("div", pickDomProps(props), children as ReactType.ReactNode)
      : null;
  class AnimatedValue {
    value: number;

    constructor(value: number) {
      this.value = value;
    }

    setValue(value: number) {
      this.value = value;
    }

    interpolate() {
      return this.value;
    }
  }
  const createAnimation = () => ({
    start(callback?: (result: { finished: boolean }) => void) {
      callback?.({ finished: true });
    },
    stop() {
      return undefined;
    },
  });
  const Animated = {
    Value: AnimatedValue,
    View,
    parallel: () => createAnimation(),
    loop: () => createAnimation(),
    sequence: () => createAnimation(),
    spring: () => createAnimation(),
    timing: () => createAnimation(),
  };
  return {
    AccessibilityInfo: {
      addEventListener: () => ({
        remove() {
          return undefined;
        },
      }),
      announceForAccessibility: announceForAccessibilityMock,
      isReduceMotionEnabled: () => Promise.resolve(false),
    },
    ActivityIndicator: (props: Record<string, any>) =>
      React.createElement("span", pickDomProps(props), "Loading"),
    Alert: {
      alert: alertMock,
    },
    Animated,
    Appearance: {
      getColorScheme: () => "light",
      setColorScheme: () => undefined,
      addChangeListener: () => ({
        remove() {
          return undefined;
        },
      }),
    },
    useColorScheme: () => "light",
    AppState: {
      currentState: "active",
      addEventListener: () => ({
        remove() {
          return undefined;
        },
      }),
    },
    Dimensions: {
      get: () => ({ width: 390, height: 844, scale: 3, fontScale: 1 }),
      addEventListener: () => ({
        remove() {
          return undefined;
        },
      }),
    },
    TurboModuleRegistry: {
      get: () => null,
      getEnforcing: () => new Proxy({}, { get: () => () => undefined }),
    },
    InputAccessoryView,
    Keyboard: {
      dismiss: keyboardDismissMock,
      addListener: (name: string, handler: (event: unknown) => void) => {
        const handlers = keyboardListeners.get(name) ?? new Set<(event: unknown) => void>();
        handlers.add(handler);
        keyboardListeners.set(name, handlers);

        return {
          remove() {
            handlers.delete(handler);
          },
        };
      },
    },
    KeyboardAvoidingView,
    Image,
    LayoutAnimation: {
      configureNext: () => undefined,
      Presets: {
        easeInEaseOut: {},
      },
    },
    Easing: {
      cubic: (value: number) => value,
      linear: (value: number) => value,
      out: (easing: (value: number) => number) => easing,
    },
    Linking: {
      openURL: () => Promise.resolve(),
    },
    Modal,
    PixelRatio: {
      get: () => 2,
      getFontScale: () => 1,
      roundToNearestPixel: (value: number) => Math.round(value * 2) / 2,
    },
    Platform: {
      OS: platformOS,
      select: (value: Record<string, any>) => value[platformOS] ?? value.default ?? null,
    },
    Pressable,
    RefreshControl: () => null,
    SafeAreaView,
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
    Switch,
    Text,
    TextInput,
    UIManager: {
      setLayoutAnimationEnabledExperimental: () => undefined,
    },
    useWindowDimensions: () => ({
      fontScale: 1,
      height: 844,
      scale: 2,
      width: 390,
    }),
    View,
  };
}

export function createSafeAreaContextModule(React: ReactModule) {
  const SafeAreaProvider = ({ children, ...props }: Record<string, any>) =>
    React.createElement("div", pickDomProps(props), children as ReactType.ReactNode);
  const SafeAreaView = ({ children, ...props }: Record<string, any>) =>
    React.createElement("div", pickDomProps(props), children as ReactType.ReactNode);

  return {
    SafeAreaProvider,
    SafeAreaView,
    useSafeAreaInsets: () => ({
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
    }),
  };
}

export function createGestureHandlerModule(React: ReactModule) {
  return {
    GestureHandlerRootView: ({ children, ...props }: Record<string, any>) =>
      React.createElement("div", pickDomProps(props), children as ReactType.ReactNode),
  };
}

export function createScreenModule(React: ReactModule) {
  return {
    Card: ({
      title,
      body,
      detail,
      headerAccessory,
    }: {
      title: string;
      body?: string;
      detail?: ReactType.ReactNode;
      headerAccessory?: ReactType.ReactNode;
    }) =>
      React.createElement(
        "article",
        {},
        React.createElement(
          "div",
          {},
          React.createElement("h2", {}, title),
          headerAccessory ?? null,
        ),
        body ? React.createElement("p", {}, body) : null,
        detail ?? null,
      ),
    Screen: ({
      title,
      subtitle,
      stickyHeader,
      renderOverlay,
      footer,
      scrollViewRef,
      onScroll,
      children,
    }: {
      title?: string;
      subtitle?: string;
      stickyHeader?: ReactType.ReactNode;
      renderOverlay?: (options: { stickyHeaderHeight: number }) => ReactType.ReactNode;
      footer?: ReactType.ReactNode;
      scrollViewRef?: { current: unknown } | null;
      onScroll?: (event: unknown) => void;
      children: ReactType.ReactNode;
    }) => {
      if (scrollViewRef) {
        scrollViewRef.current = {
          scrollTo: screenScrollToMock,
        };
      }

      return React.createElement(
        "section",
        {
          "data-testid": "screen-scroll",
          onScroll: onScroll
            ? (event: ReactType.UIEvent<HTMLElement>) =>
                onScroll({
                  nativeEvent: {
                    contentOffset: { y: Number(event.currentTarget.dataset.scrollY ?? 0) },
                  },
                })
            : undefined,
        },
        title ? React.createElement("h1", {}, title) : null,
        subtitle ? React.createElement("p", {}, subtitle) : null,
        stickyHeader ?? null,
        renderOverlay?.({
          stickyHeaderHeight: 0,
        }) ?? null,
        children,
        footer ?? null,
      );
    },
    // Skeletons import these from the real Screen module so their placeholder
    // card is literally the card's own surface. The harness drops `style`
    // anyway, so the shape only has to exist, not carry values.
    CARD_ICON_FRAME_SIZE: 32,
    getCardSurfaceStyle: () => ({}),
  };
}
