import { HeaderBarAction } from "../../../shared/navigation/HeaderBarAction";
import { HeaderFilterAction } from "../../../shared/navigation/HeaderFilterAction";

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
