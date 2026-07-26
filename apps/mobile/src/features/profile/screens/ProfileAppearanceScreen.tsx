import { Screen } from "../../../shared/components/Screen";
import { useThemeMode } from "../../../shared/providers/ThemeModeProvider";
import type { ThemePreference } from "../../../shared/lib/theme-preference";
import { ProfilePanel, ProfileSection, ProfileChoiceGroup } from "../components/ProfilePrimitives";

const THEME_PREFERENCE_OPTIONS: Array<{ id: ThemePreference; name: string }> = [
  { id: "system", name: "System" },
  { id: "light", name: "Light" },
  { id: "dark", name: "Dark" },
];

export default function ProfileAppearanceScreen() {
  const { preference, setPreference } = useThemeMode();

  return (
    <Screen bottomPaddingMode="tabbed" title="Appearance" subtitle="Appearance">
      <ProfileSection
        title="Theme"
        description="Choose how DubGrid looks on this device. System follows your device setting."
      >
        <ProfilePanel>
          <ProfileChoiceGroup
            label="Appearance"
            items={THEME_PREFERENCE_OPTIONS}
            selectedIds={[preference]}
            onToggle={(id) => setPreference(id)}
          />
        </ProfilePanel>
      </ProfileSection>
    </Screen>
  );
}
