import { Stack } from "expo-router";
import { HeaderBarAction } from "../../../shared/navigation/HeaderBarAction";
import { HeaderFilterAction } from "../../../shared/navigation/HeaderFilterAction";
import { useMobileColors } from "../../../shared/providers/ThemeModeProvider";
import { useToolbarIcon } from "../../../shared/navigation/useToolbarIcon";

/**
 * People's add and filter in the native navigation bar: bar buttons (Liquid
 * Glass on iOS 26, Material icon buttons on Android), with Filter filled blue
 * while any filter is on. Search is `ScreenSearch`, as on every screen.
 */
export function PeopleHeaderActions({
  activeFilterCount,
  onOpenFilters,
  onAddPerson,
  split = false,
}: {
  activeFilterCount: number;
  onOpenFilters: () => void;
  /** Omitted for someone who can't add anyone. */
  onAddPerson?: () => void;
  /**
   * Split on an iPhone Duo, both in one leading toolbar: the
   * person's page beside the list holds the trailing one for Edit, and two
   * toolbars on one side replace each other.
   */
  split?: boolean;
}) {
  const mobileColors = useMobileColors();
  const addIcon = useToolbarIcon("person.badge.plus", "person-add-alt");
  const filterIcon = useToolbarIcon("line.3.horizontal.decrease", "filter-list");
  if (split) {
    const filtered = activeFilterCount > 0;
    return (
      <Stack.Toolbar placement="left">
        {onAddPerson && addIcon ? (
          <Stack.Toolbar.Button
            accessibilityLabel="Add person"
            icon={addIcon}
            onPress={onAddPerson}
          />
        ) : null}
        <Stack.Toolbar.Button
          accessibilityLabel={
            filtered
              ? `Open people filters and sort, ${activeFilterCount} active`
              : "Open people filters and sort"
          }
          icon={filterIcon}
          tintColor={filtered ? mobileColors.brand : undefined}
          variant={filtered ? "prominent" : "plain"}
          onPress={onOpenFilters}
        />
      </Stack.Toolbar>
    );
  }
  return (
    <>
      {/* Add person on the leading edge, Filter on the trailing one. */}
      {onAddPerson ? (
        <HeaderBarAction
          iconOnly
          label="Add person"
          materialIcon="person-add-alt"
          placement="left"
          sfSymbol="person.badge.plus"
          onPress={onAddPerson}
        />
      ) : null}
      <HeaderFilterAction
        accessibilityLabel="Open people filters and sort"
        activeCount={activeFilterCount}
        onPress={onOpenFilters}
      />
    </>
  );
}
