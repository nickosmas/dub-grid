export type PeopleSearchFieldProps = {
  placeholder: string;
  onSearchChange: (text: string) => void;
};

/**
 * The search field above the People list. iOS draws its own in the
 * navigation bar (`PeopleHeaderActions`), so only Android renders one here
 * (`PeopleSearchField.android.tsx`).
 */
export function PeopleSearchField(_props: PeopleSearchFieldProps) {
  return null;
}
