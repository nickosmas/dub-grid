import { NextResponse, type NextRequest } from "next/server";
import {
  mobileProfileChangeRequestActionBodySchema,
  mobileProfileChangeRequestActionResponseSchema,
  mobileProfileChangeRequestCreateBodySchema,
  mobileProfileChangeRequestCreateResponseSchema,
  mobileProfileChangeRequestsResponseSchema,
} from "@dubgrid/contracts";
import {
  cancelOwnProfileChangeRequest,
  createProfileChangeRequest,
  listAdminProfileChangeRequests,
  listOwnProfileChangeRequests,
  resolveProfileChangeRequest,
} from "@/features/account/server";
import { requireMobileAuth } from "@/features/mobile/server";
import { formatClientErrorMessage } from "@/lib/client-facing";
import { getEmployeeContactConflict } from "@/lib/employee-contact-conflicts";

export async function GET(req: NextRequest) {
  const auth = await requireMobileAuth(req);
  if ("response" in auth) return auth.response;

  const admin = req.nextUrl.searchParams.get("scope") === "admin";
  if (admin) {
    if (!auth.permissions.canManageEmployees) {
      return NextResponse.json(
        { error: "You don't have permission to view those requests." },
        { status: 403 },
      );
    }
    const requests = await listAdminProfileChangeRequests({
      serviceClient: auth.serviceClient,
      orgId: auth.currentOrg.id,
      status: "pending",
    });
    return NextResponse.json(mobileProfileChangeRequestsResponseSchema.parse({ requests }));
  }

  const requests = await listOwnProfileChangeRequests({
    serviceClient: auth.serviceClient,
    userId: auth.user.id,
    orgId: auth.currentOrg.id,
  });
  return NextResponse.json(mobileProfileChangeRequestsResponseSchema.parse({ requests }));
}

export async function POST(req: NextRequest) {
  const auth = await requireMobileAuth(req);
  if ("response" in auth) return auth.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "We couldn't read that request. Try again." },
      { status: 400 },
    );
  }

  const parsed = mobileProfileChangeRequestCreateBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Check the request details and try again." },
      { status: 400 },
    );
  }

  try {
    const request = await createProfileChangeRequest({
      serviceClient: auth.serviceClient,
      user: auth.user,
      orgId: auth.currentOrg.id,
      type: parsed.data.type,
      requestedChanges: parsed.data.requestedChanges,
      requestNote: parsed.data.requestNote,
    });
    return NextResponse.json(mobileProfileChangeRequestCreateResponseSchema.parse({ request }), {
      status: 201,
    });
  } catch (error) {
    const message = formatClientErrorMessage(error, "We couldn't send that request right now.");
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await requireMobileAuth(req);
  if ("response" in auth) return auth.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "We couldn't read that request. Try again." },
      { status: 400 },
    );
  }

  const parsed = mobileProfileChangeRequestActionBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Check the request details and try again." },
      { status: 400 },
    );
  }

  const { id } = await context.params;
  try {
    if (parsed.data.action !== "cancel" && !auth.permissions.canManageEmployees) {
      return NextResponse.json(
        { error: "You don't have permission to update that request." },
        { status: 403 },
      );
    }

    const request =
      parsed.data.action === "cancel"
        ? await cancelOwnProfileChangeRequest({
            serviceClient: auth.serviceClient,
            userId: auth.user.id,
            requestId: id,
          })
        : await resolveProfileChangeRequest({
            serviceClient: auth.serviceClient,
            actor: auth.user,
            orgId: auth.currentOrg.id,
            requestId: id,
            action: parsed.data.action,
            resolverNote: parsed.data.resolverNote,
          });

    return NextResponse.json(
      mobileProfileChangeRequestActionResponseSchema.parse({
        success: true,
        request,
      }),
    );
  } catch (error) {
    const contactConflict = getEmployeeContactConflict(error);
    if (contactConflict) {
      return NextResponse.json(contactConflict, { status: 409 });
    }

    const rawMessage = error instanceof Error ? error.message : "";
    const message = formatClientErrorMessage(error, "We couldn't update that request right now.");
    const status = rawMessage.includes("Unauthorized") ? 403 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
