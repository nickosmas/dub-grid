import Ionicons from "@expo/vector-icons/Ionicons";
import { Pressable } from "react-native";
import Animated from "react-native-reanimated";
import { usePressAnimation } from "../../../shared/motion/usePressAnimation";
import { useMobileColors } from "../../../shared/providers/ThemeModeProvider";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// Mirrors web's ExpandButton (apps/web/src/components/dashboard/ExpandButton.tsx):
// the affordance in a dashboard card's header that opens a full, expanded view
// of that card's content.
//
// A bare glyph rather than an icon-only `<Button>`: this sits in a card header
// beside the title, where a 36pt tappable box with its own tone competes with
// the title for weight. The muted glyph reads as a quiet affordance and lets
// the header stay one line of hierarchy. `hitSlop` keeps the touch target at
// the 44pt minimum even though the glyph is 20.
export function ExpandButton({
  accessibilityLabel,
  onPress,
}: {
  accessibilityLabel: string;
  onPress: () => void;
}) {
  const mobileColors = useMobileColors();
  const { animatedStyle, pressHandlers, androidRipple } = usePressAnimation({
    rippleColor: mobileColors.rippleNeutral,
    rippleBorderless: true,
  });

  return (
    <AnimatedPressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      android_ripple={androidRipple}
      hitSlop={12}
      onPress={onPress}
      style={animatedStyle}
      {...pressHandlers}
    >
      <Ionicons color={mobileColors.textMuted} name="expand-outline" size={20} />
    </AnimatedPressable>
  );
}
