import ProfileCalendarScreen from "../screens/ProfileCalendarScreen";
import ProfileNotificationsScreen from "../screens/ProfileNotificationsScreen";
import ProfilePrivacyScreen from "../screens/ProfilePrivacyScreen";
import ProfileSecurityScreen from "../screens/ProfileSecurityScreen";
import ProfileWorkScreen from "../screens/ProfileWorkScreen";

/** The Profile settings that open as their own page, by route name. */
const PROFILE_SPLIT_SECTIONS = [
  "work",
  "security",
  "notifications",
  "calendar",
  "privacy",
] as const;

export type ProfileSplitSection = (typeof PROFILE_SPLIT_SECTIONS)[number];

export function isProfileSplitSection(value: string): value is ProfileSplitSection {
  return (PROFILE_SPLIT_SECTIONS as readonly string[]).includes(value);
}

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
