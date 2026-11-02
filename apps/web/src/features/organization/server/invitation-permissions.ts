import { NextResponse } from "next/server";
import { applyConfigurablePermissions } from "@dubgrid/authz";

/**
 * The permissions an invite stores (113), which accepting it copies onto the
 * new membership. Only an Admin invite carries them, and only someone who can
 * set an Admin's permissions may choose them. An invite without them gives
 * the standard Admin set, as before.
 */
export function invitationAdminPermissions(input: {
  role: string;
  requested: Record<string, boolean> | undefined;
  canConfigure: boolean;
}): { permissions: Record<string, boolean> | null } | { response: NextResponse } {
  if (input.requested === undefined) return { permissions: null };
  if (input.role !== "admin") {
    return {
      response: NextResponse.json(
        { error: "Permissions are set for people invited as an Admin." },
        { status: 400 },
      ),
    };
  }
  if (!input.canConfigure) {
    return {
      response: NextResponse.json(
        { error: "Only a Super Admin can set an Admin's permissions." },
        { status: 403 },
      ),
    };
  }
  return { permissions: { ...applyConfigurablePermissions(null, input.requested) } };
}
