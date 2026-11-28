import Ionicons from "@expo/vector-icons/Ionicons";
import { StyleSheet, View } from "react-native";
import { AppText } from "../components/AppText";
import { Pressable } from "../components/Pressable";
import { useMobileColors } from "../providers/ThemeModeProvider";
import { mobileSpace } from "../theme/tokens";
import { usePaneHeader } from "./paneHeader";

/** A link back to the page the pane showed before, named for that page. */
export type PaneBack = { label: string; onPress: () => void };

/**
 * A split view's detail pane names its page. In a pane with its own native
 * bar the title is that bar's large title, which shrinks into the bar as the
 * page scrolls; only the eyebrow and the way back stay on the page.
 */
export function PaneTitle({
  eyebrow,
  title,
  back,
}: {
  eyebrow?: string;
  title: string;
  back?: PaneBack;
}) {
  const inPaneBar = usePaneHeader({ title });
  if (inPaneBar && !back && !eyebrow) return null;
  return (
    <View style={styles.heading}>
      {back ? <PaneBackLink back={back} /> : null}
      {eyebrow ? (
        <AppText tone="secondary" variant="meta">
          {eyebrow}
        </AppText>
      ) : null}
      {inPaneBar ? null : (
        <AppText accessibilityRole="header" variant="screenTitle">
          {title}
        </AppText>
      )}
    </View>
  );
}

/** The link itself, for a pane that draws its own title. */
export function PaneBackLink({ back }: { back: PaneBack }) {
  const mobileColors = useMobileColors();
  return (
    <Pressable
      accessibilityLabel={`Back to ${back.label}`}
      accessibilityRole="button"
      hitSlop={8}
      onPress={back.onPress}
      style={styles.back}
    >
      <Ionicons color={mobileColors.brand} name="chevron-back" size={18} />
      <AppText tone="brand" variant="meta">
        {back.label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  heading: {
    gap: mobileSpace.xs,
  },
  back: {
    alignItems: "center",
    alignSelf: "flex-start",
    flexDirection: "row",
    gap: mobileSpace.xs,
  },
});
