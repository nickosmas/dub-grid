import { Stack } from "expo-router";
import { HeaderFilterAction } from "../../../shared/navigation/HeaderFilterAction";
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
}: {
  activeFilterCount: number;
  onOpenFilters: () => void;
  /** Omitted for someone who can't add anyone. */
  onAddPerson?: () => void;
}) {
  const addIcon = useToolbarIcon("person.badge.plus", "person-add-alt");

  return (
    <>
      {/* Add person on the leading edge, Filter on the trailing one. Android
          draws its icons to images first, so a button waits for its image
          rather than render empty. */}
      {onAddPerson && addIcon ? (
        <Stack.Toolbar placement="left">
          <Stack.Toolbar.Button
            accessibilityLabel="Add person"
            icon={addIcon}
            onPress={onAddPerson}
          />
        </Stack.Toolbar>
      ) : null}
      <HeaderFilterAction
        accessibilityLabel="Open people filters and sort"
        activeCount={activeFilterCount}
        onPress={onOpenFilters}
      />
    </>
  );
}
