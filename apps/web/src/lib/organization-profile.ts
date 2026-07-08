import type { Organization } from "@/types";

export interface StructuredOrganizationAddress {
  addressLine1: string;
  addressLine2: string;
  addressCity: string;
  addressState: string;
  addressPostalCode: string;
  addressCountry: string;
}

function joinNonEmpty(parts: Array<string | null | undefined>, separator: string): string {
  return parts
    .map((part) => part?.trim() ?? "")
    .filter(Boolean)
    .join(separator);
}

export function composeOrganizationAddress(address: StructuredOrganizationAddress): string {
  const lineBlock = joinNonEmpty([address.addressLine1, address.addressLine2], ", ");
  const cityStatePostal = [
    address.addressCity.trim(),
    joinNonEmpty([address.addressState, address.addressPostalCode], " "),
  ]
    .filter(Boolean)
    .join(", ");

  return [lineBlock, cityStatePostal, address.addressCountry.trim()].filter(Boolean).join(", ");
}

export function getOrganizationAddressFields(
  organization: Pick<
    Organization,
    | "address"
    | "addressLine1"
    | "addressLine2"
    | "addressCity"
    | "addressState"
    | "addressPostalCode"
    | "addressCountry"
  >,
): StructuredOrganizationAddress {
  return {
    addressLine1: organization.addressLine1 || organization.address || "",
    addressLine2: organization.addressLine2 || "",
    addressCity: organization.addressCity || "",
    addressState: organization.addressState || "",
    addressPostalCode: organization.addressPostalCode || "",
    addressCountry: organization.addressCountry || "",
  };
}

export function withComposedOrganizationAddress<T extends StructuredOrganizationAddress>(
  value: T,
): T & { address: string } {
  return {
    ...value,
    address: composeOrganizationAddress(value),
  };
}
