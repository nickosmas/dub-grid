import { StyleSheet, View } from "react-native";
import { AppText } from "../components/AppText";
import { mobileSpace } from "../theme/tokens";

/**
 * A page's own title in a split view's detail pane, where the native bar
 * belongs to the list's page: a small line naming where it sits, then the
 * page's name.
 */
export function PaneTitle({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <View style={styles.heading}>
      <AppText tone="secondary" variant="meta">
        {eyebrow}
      </AppText>
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
