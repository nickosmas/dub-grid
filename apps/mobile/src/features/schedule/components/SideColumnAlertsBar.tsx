import { Stack, router } from "expo-router";

const NO_BAR_OPTIONS = { headerShown: false } as const;

// No title and no edge blur: the bar exists only for the bell's place in the
// side column, and each pane draws its own top.
const SPLIT_BAR_OPTIONS = {
  headerShown: true,
  headerTransparent: true,
  // A stack's common options paint the bar; this one has nothing to show.
  headerStyle: { backgroundColor: "transparent" },
  headerShadowVisible: false,
  title: "",
  scrollEdgeEffects: { top: "hidden" },
} as const;

/**
 * Split, the alerts bell stands in the iPhone Duo's side column with the tab
 * bar, where the Duo puts a page's bar buttons; that takes a bar of its own,
 * with no title, over the two panes. For a route that otherwise has no bar.
 */
export function SideColumnAlertsBar({
  shown,
  unreadCount,
}: {
  shown: boolean;
  unreadCount: number;
}) {
  return (
    <>
      <Stack.Screen options={shown ? SPLIT_BAR_OPTIONS : NO_BAR_OPTIONS} />
      {shown ? (
        <Stack.Toolbar placement="right">
          <Stack.Toolbar.Button
            accessibilityLabel={
              unreadCount > 0 ? `Open alerts, ${unreadCount} unread` : "Open alerts"
            }
            onPress={() => router.push("/alerts")}
          >
            <Stack.Toolbar.Icon sf="bell" />
            {unreadCount > 0 ? (
              <Stack.Toolbar.Badge>
                {unreadCount > 9 ? "9+" : String(unreadCount)}
              </Stack.Toolbar.Badge>
            ) : null}
          </Stack.Toolbar.Button>
        </Stack.Toolbar>
      ) : null}
    </>
  );
}
