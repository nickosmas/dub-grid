import { NextResponse, type NextRequest } from "next/server";
import { SELF_ACTION_FORBIDDEN_CODE, SELF_ACTION_FORBIDDEN_MESSAGE } from "@dubgrid/domain";
import { requireMobileAuth, type MobileAuthContext } from "@/features/mobile/server";
import {
  loadMobilePersonWithAccess,
  type LoadedMobilePerson,
} from "@/features/mobile/server/person-access";

/**
 * Shared gate for every route that writes someone's access: granting management
 * departments and setting org roles are both super_admin-or-gridmaster, the same
 * bar web holds them behind.
 *
 * Your own account is off limits by default, as it is for a role change. The
 * management-department routes opt in to `allowSelf`: web lets a super admin
 * edit their own management departments from their profile, and the mobile
 * profile does the same. The org role stays out of reach either way; a route
 * that allows self must refuse a role change on it separately.
 *
 * It sits in its own module rather than beside `loadMobilePersonWithAccess`
 * because the route tests stub that loader wholesale; sharing a module would
 * make every one of them re-provide this gate to keep it real.
 */
export async function requireManagementAccessActor(
  req: NextRequest,
  employeeId: string,
  { allowSelf = false }: { allowSelf?: boolean } = {},
): Promise<
  | { response: NextResponse }
  | { auth: MobileAuthContext; loaded: LoadedMobilePerson; isSelf: boolean }
> {
  const auth = await requireMobileAuth(req);
  if ("response" in auth) return auth;

  if (!auth.permissions.canManageUsers) {
    return {
      response: NextResponse.json(
        { error: "You don't have permission to manage management access." },
        { status: 403 },
      ),
    };
  }

  const loaded = await loadMobilePersonWithAccess(
    auth.serviceClient,
    auth.currentOrg.id,
    employeeId,
  );
  if (!loaded) {
    return { response: NextResponse.json({ error: "Employee not found" }, { status: 404 }) };
  }
  if (loaded.person.status === "removed") {
    return {
      response: NextResponse.json(
        { error: "Removed staff can't be given management access." },
        { status: 400 },
      ),
    };
  }
  const isSelf = Boolean(loaded.userId && loaded.userId === auth.user.id);
  if (isSelf && !allowSelf) {
    return { response: selfActionForbiddenResponse() };
  }

  return { auth, loaded, isSelf };
}

export function selfActionForbiddenResponse() {
  return NextResponse.json(
    { error: SELF_ACTION_FORBIDDEN_MESSAGE, code: SELF_ACTION_FORBIDDEN_CODE },
    { status: 403 },
  );
}
