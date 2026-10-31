import { Stack } from "expo-router";
import { useToolbarIcon } from "../../../shared/navigation/useToolbarIcon";

/**
 * People's search, filter and add in the native navigation bar: the system
 * search field, and bar buttons (Liquid Glass on iOS 26, Material icon
 * buttons on Android), with the active filter count as the Filter badge.
 */
export function PeopleHeaderActions({
  searchPlaceholder,
  onSearchChange,
  activeFilterCount,
  onOpenFilters,
  onAddPerson,
}: {
  searchPlaceholder: string;
  onSearchChange: (text: string) => void;
  activeFilterCount: number;
  onOpenFilters: () => void;
  /** Omitted for someone who can't add anyone. */
  onAddPerson?: () => void;
}) {
  const filterIcon = useToolbarIcon(
    activeFilterCount > 0
      ? "line.3.horizontal.decrease.circle.fill"
      : "line.3.horizontal.decrease.circle",
    "filter-list",
  );
  const addIcon = useToolbarIcon("person.badge.plus", "person-add-alt");

  return (
    <>
      <Stack.SearchBar
        hideWhenScrolling={false}
        placeholder={searchPlaceholder}
        onChangeText={(event) => onSearchChange(event.nativeEvent.text)}
        onCancelButtonPress={() => onSearchChange("")}
      />
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button
          accessibilityLabel={
            activeFilterCount > 0
              ? `Open people filters and sort, ${activeFilterCount} active`
              : "Open people filters and sort"
          }
          icon={filterIcon}
          onPress={onOpenFilters}
        >
          {activeFilterCount > 0 ? (
            <Stack.Toolbar.Badge>{String(activeFilterCount)}</Stack.Toolbar.Badge>
          ) : null}
        </Stack.Toolbar.Button>
        {onAddPerson ? (
          <Stack.Toolbar.Button
            accessibilityLabel="Add person"
            icon={addIcon}
            onPress={onAddPerson}
          />
        ) : null}
      </Stack.Toolbar>
    </>
  );
}
