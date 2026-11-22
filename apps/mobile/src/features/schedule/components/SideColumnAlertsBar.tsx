import { Stack, router } from "expo-router";

const NO_BAR_OPTIONS = { headerShown: false } as const;

// No title and no edge blur: the bar exists only for the side column's
// buttons, and each pane draws its own top.
const SPLIT_BAR_OPTIONS = {
  headerShown: true,
  headerTransparent: true,
  // A stack's common options paint the bar; this one has nothing to show.
  headerStyle: { backgroundColor: "transparent" },
  headerShadowVisible: false,
  title: "",
  scrollEdgeEffects: { top: "hidden" },
} as const;

/** The page's steps, which stand in the side column under the bell. */
export type SideColumnStepper = {
  previousLabel: string;
  nextLabel: string;
  onPrevious: (() => void) | null;
  onNext: (() => void) | null;
  /** Null while the page already shows today. */
  onToday: (() => void) | null;
  /** Up and down, for a page that scrolls through months. */
  vertical?: boolean;
};

/**
 * On an iPhone Duo, open or closed, the alerts bell stands in the side column
 * with the tab bar, where the Duo puts a page's bar buttons; that takes a bar
 * of its own, with no title. For a route that otherwise has no bar. A page
 * that steps through weeks or months puts its arrows and Today there too, so
 * no button sits in the page itself.
 */
export function SideColumnAlertsBar({
  shown,
  unreadCount,
  stepper,
}: {
  shown: boolean;
  unreadCount: number;
  stepper?: SideColumnStepper;
}) {
  return (
    <>
      <Stack.Screen options={shown ? SPLIT_BAR_OPTIONS : NO_BAR_OPTIONS} />
      {shown ? (
        <Stack.Toolbar placement="right">
          {/* The bell has its own capsule; the arrows and Today share one. */}
          <Stack.Toolbar.Button
            accessibilityLabel={
              unreadCount > 0 ? `Open alerts, ${unreadCount} unread` : "Open alerts"
            }
            onPress={() => router.push("/alerts")}
            separateBackground={stepper !== undefined}
          >
            <Stack.Toolbar.Icon sf="bell" />
            {unreadCount > 0 ? (
              <Stack.Toolbar.Badge>
                {unreadCount > 9 ? "9+" : String(unreadCount)}
              </Stack.Toolbar.Badge>
            ) : null}
          </Stack.Toolbar.Button>
          {stepper?.onPrevious ? (
            <Stack.Toolbar.Button
              accessibilityLabel={stepper.previousLabel}
              onPress={stepper.onPrevious}
            >
              <Stack.Toolbar.Icon sf={stepper.vertical ? "chevron.up" : "chevron.left"} />
            </Stack.Toolbar.Button>
          ) : null}
          {stepper?.onToday ? (
            // A return arrow, not a calendar: the Schedule tab below is one.
            <Stack.Toolbar.Button accessibilityLabel="Today" onPress={stepper.onToday}>
              <Stack.Toolbar.Icon sf="arrow.uturn.backward" />
            </Stack.Toolbar.Button>
          ) : null}
          {stepper?.onNext ? (
            <Stack.Toolbar.Button accessibilityLabel={stepper.nextLabel} onPress={stepper.onNext}>
              <Stack.Toolbar.Icon sf={stepper.vertical ? "chevron.down" : "chevron.right"} />
            </Stack.Toolbar.Button>
          ) : null}
        </Stack.Toolbar>
      ) : null}
    </>
  );
}
