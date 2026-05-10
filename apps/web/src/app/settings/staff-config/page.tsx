import { redirect } from "next/navigation";

export default function LegacyStaffConfigSettingsPage() {
  redirect("/settings?section=staff-certifications");
}
