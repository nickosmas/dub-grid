/**
 * Who a detail surface is rendered for. An organization's own people (staff,
 * admins, super admins) see only what they can act on; platform staff see the
 * operational detail behind it. An impersonating gridmaster is `org`, since
 * impersonation exists to show the organization's own experience.
 */
export type Audience = "org" | "platform";

export function audienceForViewer(viewer: { isGridmaster: boolean }): Audience {
  return viewer.isGridmaster ? "platform" : "org";
}
