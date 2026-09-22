import { useCallback, useEffect, useRef, useState } from "react";
import {
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type TextLayoutEvent,
  type TextStyle,
} from "react-native";
import { FIT_TEXT_MEASURE_TEST_ID } from "./fit-text-measure-id";
import { readFontSize, readLineHeight, Text, type TextProps } from "./Text";

/** How far a label may shrink before it gives up and truncates. */
export const MIN_FIT_SCALE = 0.5;

/**
 * The font scale that fits a label of `naturalWidth` into `slotWidth`, given
 * the scale it renders at now. Only ever smaller: a label that fits keeps its
 * scale, and one that does not shrinks by the ratio, floored at `MIN_FIT_SCALE`.
 */
export function resolveFitScale(
  naturalWidth: number | null,
  slotWidth: number | null,
  currentScale: number,
): number {
  if (naturalWidth == null || slotWidth == null || naturalWidth <= 0 || slotWidth <= 0) {
    return currentScale;
  }
  // Half a point of tolerance: layout rounds to the pixel grid, and a label
  // that measures a hair wider than its slot is not truncated.
  if (naturalWidth * currentScale <= slotWidth + 0.5) return currentScale;
  return Math.min(currentScale, Math.max(MIN_FIT_SCALE, slotWidth / naturalWidth));
}

/**
 * A one-line control label that shrinks its font to the width it has rather
 * than wrapping or ellipsizing. React Native's own `adjustsFontSizeToFit` is
 * not used: on the new architecture it ignores `minimumFontScale` and fits
 * against the container's height as well as its width, so a label at a raised
 * text size collapsed to a fraction of its base. This measures instead.
 *
 * A hidden copy of the label, laid out without a width limit, reports the
 * label's natural width. The visible copy reports the width it was given. When
 * the natural width is larger, the font scales by the ratio, floored at
 * `MIN_FIT_SCALE`, below which the ellipsis returns. The wrapper's width
 * follows the visible text, so a shrink is applied once from the unscaled
 * measurement and never chases its own result; `containerWidth` growing past
 * the width it had at that shrink restores the full size for a fresh measure.
 */
export function FitText({
  style,
  containerWidth,
  children,
  ...props
}: Omit<TextProps, "style" | "numberOfLines"> & {
  style?: StyleProp<TextStyle>;
  /** The enclosing control's width; growth past the width at the last shrink re-measures. */
  containerWidth?: number;
}) {
  const [scale, setScale] = useState(1);
  const naturalWidth = useRef<number | null>(null);
  const slotWidth = useRef<number | null>(null);
  const scaleRef = useRef(1);
  const shrunkAtWidth = useRef<number | null>(null);

  const fontSize = readFontSize(style);
  const lineHeight = readLineHeight(style);

  const apply = useCallback(() => {
    const next = resolveFitScale(naturalWidth.current, slotWidth.current, scaleRef.current);
    if (next < scaleRef.current) {
      scaleRef.current = next;
      shrunkAtWidth.current = containerWidth ?? null;
      setScale(next);
    }
  }, [containerWidth]);

  const onSlotLayout = useCallback(
    (event: LayoutChangeEvent) => {
      slotWidth.current = event.nativeEvent.layout.width;
      apply();
    },
    [apply],
  );

  const onMeasure = useCallback(
    (event: TextLayoutEvent) => {
      const line = event.nativeEvent.lines[0];
      naturalWidth.current = line ? line.width : null;
      apply();
    },
    [apply],
  );

  const reset = useCallback(() => {
    scaleRef.current = 1;
    naturalWidth.current = null;
    shrunkAtWidth.current = null;
    setScale(1);
  }, []);

  // A new label or a new style starts over at full size. The hidden copy
  // re-measures on its own; the slot reports on the next layout pass, and
  // `apply` only acts once both are known.
  useEffect(reset, [children, fontSize, reset]);

  // So does a container that has grown since the label shrank. Only growth
  // counts: a hugging container's width follows the label, so it narrows
  // right after a shrink, and resetting on that would oscillate.
  useEffect(() => {
    if (containerWidth == null || scaleRef.current === 1) return;
    const shrunkAt = shrunkAtWidth.current;
    // The slot can shrink the label before the container has reported at
    // all; that first report is the baseline, not growth.
    if (shrunkAt == null) {
      shrunkAtWidth.current = containerWidth;
      return;
    }
    if (containerWidth > shrunkAt + 1) reset();
  }, [containerWidth, reset]);

  const scaledStyle =
    scale < 1 && fontSize
      ? {
          fontSize: fontSize * scale,
          ...(lineHeight ? { lineHeight: lineHeight * scale } : null),
        }
      : null;

  return (
    <View onLayout={onSlotLayout} style={styles.slot}>
      <Text {...props} fit={props.fit ?? "compact"} style={[style, scaledStyle]}>
        {children}
      </Text>
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        pointerEvents="none"
        style={styles.measureHost}
        testID={FIT_TEXT_MEASURE_TEST_ID}
      >
        <Text {...props} fit={props.fit ?? "compact"} onTextLayout={onMeasure} style={style}>
          {children}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  slot: {
    flexShrink: 1,
    minWidth: 0,
    alignItems: "center",
  },
  // Wide enough that the copy inside never truncates, invisible, and out of
  // the slot's own layout so it cannot hold the slot open.
  measureHost: {
    position: "absolute",
    left: 0,
    top: 0,
    width: 4096,
    opacity: 0,
  },
});
