import type * as ReactType from "react";
import { vi } from "vitest";

type ReactModule = typeof ReactType;

export const screenScrollToMock = vi.fn();
export const alertMock = vi.fn();

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
      key === "allowSwipeDismissal" ||
      key === "presentationStyle" ||
      key === "transparent" ||
      key === "visible" ||
      key === "onRequestClose" ||
      key === "horizontal" ||
      key === "showsHorizontalScrollIndicator" ||
      key === "showsVerticalScrollIndicator" ||
      key === "contentInsetAdjustmentBehavior" ||
      key === "automaticallyAdjustContentInsets" ||
      key === "automaticallyAdjustsScrollIndicatorInsets" ||
      key === "stickyHeaderIndices" ||
      key === "onStartShouldSetResponder" ||
      key === "onLayout" ||
      key === "onResponderGrant" ||
      key === "onResponderRelease" ||
      key === "pointerEvents" ||
      key === "numberOfLines" ||
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
        disabled?: boolean;
        expanded?: boolean;
        selected?: boolean;
      };
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

    if (key === "testID") {
      output["data-testid"] = value;
      continue;
    }

    output[key] = value;
  }

  return output;
}

export function createReactNativeModule(React: ReactModule) {
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

    return React.createElement("div", pickDomProps(props), children as ReactType.ReactNode);
  };
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
  const Image = ({ source, ...props }: Record<string, any>) =>
    React.createElement("img", {
      alt: props.accessibilityLabel ?? "",
      ...pickDomProps(props),
    });
  const SafeAreaView = ({ children, ...props }: Record<string, any>) =>
    React.createElement("div", pickDomProps(props), children as ReactType.ReactNode);
  const Pressable = ({ children, onPress, disabled, ...props }: Record<string, any>) =>
    React.createElement(
      "button",
      {
        type: "button",
        disabled,
        onClick: onPress as (() => void) | undefined,
        ...pickDomProps(props),
      },
      children as ReactType.ReactNode,
    );
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
      isReduceMotionEnabled: () => Promise.resolve(false),
    },
    ActivityIndicator: (props: Record<string, any>) =>
      React.createElement("span", pickDomProps(props), "Loading"),
    Alert: {
      alert: alertMock,
    },
    Animated,
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
    Platform: {
      OS: "ios",
      select: (value: Record<string, any>) => value.ios ?? value.default ?? null,
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
      scrollViewRef,
      children,
    }: {
      title?: string;
      subtitle?: string;
      stickyHeader?: ReactType.ReactNode;
      renderOverlay?: (options: { stickyHeaderHeight: number }) => ReactType.ReactNode;
      scrollViewRef?: { current: unknown } | null;
      children: ReactType.ReactNode;
    }) => {
      if (scrollViewRef) {
        scrollViewRef.current = {
          scrollTo: screenScrollToMock,
        };
      }

      return React.createElement(
        "section",
        {},
        title ? React.createElement("h1", {}, title) : null,
        subtitle ? React.createElement("p", {}, subtitle) : null,
        stickyHeader ?? null,
        renderOverlay?.({
          stickyHeaderHeight: 0,
        }) ?? null,
        children,
      );
    },
  };
}

