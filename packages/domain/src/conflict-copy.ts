/**
 * What a save says when someone else saved first: "Someone else just changed
 * their status. Refresh and try again." One wording for every conflict, on web
 * and mobile alike.
 */
export function changedElsewhereMessage(what: string): string {
  return `Someone else just changed ${what}. Refresh and try again.`;
}
