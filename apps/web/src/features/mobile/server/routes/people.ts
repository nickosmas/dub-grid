import { NextResponse, type NextRequest } from "next/server";
import { mobilePeopleResponseSchema } from "@dubgrid/contracts";
import { fetchMobilePeople, requireMobileAuth } from "@/features/mobile/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireMobileAuth(req);
  if ("response" in auth) return auth.response;

  if (!auth.permissions.canViewStaff) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const people = await fetchMobilePeople(auth.serviceClient, auth.currentOrg.id);

  return NextResponse.json(
    mobilePeopleResponseSchema.parse({
      people: people.map((person) => ({
        id: person.id,
        firstName: person.firstName,
        lastName: person.lastName,
        phone: person.phone,
        email: person.email,
        status: person.status,
        focusAreaIds: person.focusAreaIds,
      })),
    }),
  );
}
