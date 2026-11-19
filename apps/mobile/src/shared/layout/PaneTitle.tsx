import { StyleSheet, View } from "react-native";
import { AppText } from "../components/AppText";
import { mobileSpace } from "../theme/tokens";

/**
 * A split view's detail pane names its page, where the native bar belongs to
 * the list's page. Only what the list beside it doesn't show goes above.
 */
export function PaneTitle({ eyebrow, title }: { eyebrow?: string; title: string }) {
  return (
    <View style={styles.heading}>
      {eyebrow ? (
        <AppText tone="secondary" variant="meta">
          {eyebrow}
        </AppText>
      ) : null}
      <AppText accessibilityRole="header" variant="screenTitle">
        {title}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  heading: {
    gap: mobileSpace.xs,
    paddingTop: mobileSpace.lg,
  },
});
