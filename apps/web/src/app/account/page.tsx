import { redirect } from "next/navigation";

/**
 * Account settings live under /settings as the Account group. /account is
 * kept as a permanent redirect so old bookmarks and in-app links still work.
 */
export default function AccountRedirect() {
  redirect("/settings?section=profile");
}
