import ProfileCalendarScreen from "../screens/ProfileCalendarScreen";
import ProfileNotificationsScreen from "../screens/ProfileNotificationsScreen";
import ProfilePrivacyScreen from "../screens/ProfilePrivacyScreen";
import ProfileSecurityScreen from "../screens/ProfileSecurityScreen";
import ProfileWorkScreen from "../screens/ProfileWorkScreen";

/** The Profile settings that open as their own page, by route name. */
export type ProfileSplitSection = "work" | "security" | "notifications" | "calendar" | "privacy";

/** The chosen setting beside Profile on an open iPhone Duo. */
export function ProfileSplitPane({
  section,
  onUnsavedChange,
}: {
  section: ProfileSplitSection;
  onUnsavedChange: (unsaved: boolean) => void;
}) {
  switch (section) {
    case "work":
      return <ProfileWorkScreen embedded onUnsavedChange={onUnsavedChange} />;
    case "security":
      return <ProfileSecurityScreen embedded />;
    case "notifications":
      return <ProfileNotificationsScreen embedded />;
    case "calendar":
      return <ProfileCalendarScreen embedded />;
    case "privacy":
      return <ProfilePrivacyScreen embedded />;
  }
}
