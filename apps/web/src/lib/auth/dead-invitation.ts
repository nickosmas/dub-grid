// The opaque dead-token contract, kept free of server imports so the accept
// page can recognise it without bundling next/server.
// One message for every reason a link is dead, so it never says which. It
// names replacement because a reissue is the likeliest reason a link the
// person still holds has stopped working.
export const DEAD_INVITATION_MESSAGE =
  "This invitation link no longer works. A new invitation replaces any earlier one, so if you have a more recent invitation email, use its link. If you've already accepted, sign in. Otherwise, ask the organization that invited you for a new invitation.";
export const DEAD_INVITATION_CODE = "INVITATION_INVALID";
