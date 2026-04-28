import { NextResponse, type NextRequest } from "next/server";
import { mobilePeopleResponseSchema } from "@dubgrid/contracts";
import {
  loadMobilePeoplePayload,
  MobileApiAuthorizationError,
} from "@dubgrid/mobile-api-core";
import { fetchMobilePeople, requireMobileAuth } from "@/features/mobile/server";
import type { Employee } from "@/types";

export const dynamic = "force-dynamic";

type MobilePersonSource = Pick<
  Employee,
  | "id"
  | "firstName"
  | "lastName"
  | "phone"
  | "email"
  | "status"
  | "focusAreaIds"
  | "contactNotes"
  | "statusChangedAt"
  | "statusNote"
  | "version"
>;

export function mapEmployeeToMobilePerson(person: MobilePersonSource) {
  return {
    id: person.id,
    firstName: person.firstName,
    lastName: person.lastName,
    phone: person.phone,
    email: person.email,
    status: person.status,
    focusAreaIds: person.focusAreaIds,
    contactNotes: person.contactNotes,
    statusChangedAt: person.statusChangedAt,
    statusNote: person.statusNote,
    version: person.version,
  };
}

export async function GET(req: NextRequest) {
  const auth = await requireMobileAuth(req);
  if ("response" in auth) return auth.response;

  try {
    const payload = await loadMobilePeoplePayload(auth, {
      fetchMobilePeople,
      mapEmployeeToMobilePerson,
    });

    return NextResponse.json(mobilePeopleResponseSchema.parse(payload));
  } catch (error) {
    if (error instanceof MobileApiAuthorizationError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    throw error;
  }
}
