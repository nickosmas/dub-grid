import type { StructuredOrganizationAddress } from "@/lib/organization-profile";

interface GoogleAddressComponentLegacy {
  long_name?: string;
  short_name?: string;
  types: string[];
}

interface GoogleAddressComponentModern {
  longText?: string;
  shortText?: string;
  types: string[];
}

type GoogleAddressComponent =
  | GoogleAddressComponentLegacy
  | GoogleAddressComponentModern;

function isModernAddressComponent(
  component: GoogleAddressComponent,
): component is GoogleAddressComponentModern {
  return "longText" in component || "shortText" in component;
}

export interface GoogleStringRange {
  startOffset: number;
  endOffset: number;
}

export interface GoogleFormattableText {
  text?: string;
  matches?: GoogleStringRange[];
  toString?: () => string;
}

export interface GooglePostalAddress {
  addressLines?: string[];
  locality?: string;
  administrativeArea?: string;
  postalCode?: string;
  regionCode?: string;
}

export interface GooglePlaceResult {
  address_components?: GoogleAddressComponent[];
  addressComponents?: GoogleAddressComponent[];
  formattedAddress?: string;
  displayName?: string | null;
  postalAddress?: GooglePostalAddress;
}

export interface GooglePlace extends GooglePlaceResult {
  fetchFields: (request: { fields: string[] }) => Promise<unknown>;
}

export interface GooglePlacePrediction {
  text: GoogleFormattableText;
  mainText?: GoogleFormattableText;
  secondaryText?: GoogleFormattableText;
  toPlace: () => GooglePlace;
}

export interface GoogleAutocompleteSuggestion {
  placePrediction?: GooglePlacePrediction | null;
}

export interface GoogleAutocompleteRequest {
  input: string;
  sessionToken?: object;
  language?: string;
  region?: string;
  includedRegionCodes?: string[];
}

export interface GooglePlacesLibrary {
  AutocompleteSuggestion: {
    fetchAutocompleteSuggestions: (
      request: GoogleAutocompleteRequest,
    ) => Promise<{ suggestions: GoogleAutocompleteSuggestion[] }>;
  };
  AutocompleteSessionToken: new () => object;
}

export interface GoogleMapsNamespace {
  maps: {
    importLibrary?: (libraryName: "places") => Promise<unknown>;
    places?: Partial<GooglePlacesLibrary>;
    event?: {
      clearInstanceListeners?: (instance: object) => void;
    };
  };
}

let googleMapsPromise: Promise<GoogleMapsNamespace | null> | null = null;

function getGoogleMaps(): GoogleMapsNamespace | null {
  if (typeof window === "undefined") return null;
  return (window as Window & { google?: GoogleMapsNamespace }).google ?? null;
}

function hasPlacesAccess(googleMaps: GoogleMapsNamespace | null): boolean {
  return Boolean(googleMaps?.maps?.importLibrary || googleMaps?.maps?.places);
}

export function loadGoogleMapsPlaces(
  apiKey: string,
): Promise<GoogleMapsNamespace | null> {
  if (!apiKey || typeof window === "undefined") return Promise.resolve(null);

  const existingGoogle = getGoogleMaps();
  if (hasPlacesAccess(existingGoogle)) return Promise.resolve(existingGoogle);
  if (googleMapsPromise) return googleMapsPromise;

  googleMapsPromise = new Promise((resolve) => {
    const existingScript = document.querySelector<HTMLScriptElement>(
      'script[data-google-maps-places="true"]',
    );

    const handleLoad = () => {
      const googleMaps = getGoogleMaps();
      resolve(hasPlacesAccess(googleMaps) ? googleMaps : null);
    };

    const handleError = () => {
      googleMapsPromise = null;
      resolve(null);
    };

    if (existingScript) {
      existingScript.addEventListener("load", handleLoad, { once: true });
      existingScript.addEventListener("error", handleError, { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places&loading=async&v=weekly`;
    script.async = true;
    script.defer = true;
    script.dataset.googleMapsPlaces = "true";
    script.addEventListener("load", handleLoad, { once: true });
    script.addEventListener("error", handleError, { once: true });
    document.head.appendChild(script);
  });

  return googleMapsPromise;
}

export async function loadGooglePlacesLibrary(
  apiKey: string,
): Promise<GooglePlacesLibrary | null> {
  const googleMaps = await loadGoogleMapsPlaces(apiKey);
  if (!googleMaps) return null;

  if (googleMaps.maps.importLibrary) {
    try {
      const library = await googleMaps.maps.importLibrary("places");
      return library as GooglePlacesLibrary;
    } catch {
      return null;
    }
  }

  if (
    googleMaps.maps.places?.AutocompleteSuggestion &&
    googleMaps.maps.places?.AutocompleteSessionToken
  ) {
    return googleMaps.maps.places as GooglePlacesLibrary;
  }

  return null;
}

function getAddressComponents(place: GooglePlaceResult): GoogleAddressComponent[] {
  return place.addressComponents ?? place.address_components ?? [];
}

function getLongText(component: GoogleAddressComponent | undefined): string {
  if (!component) return "";
  if (isModernAddressComponent(component)) return component.longText ?? "";
  return component.long_name ?? "";
}

function getShortText(component: GoogleAddressComponent | undefined): string {
  if (!component) return "";
  if (isModernAddressComponent(component)) {
    return component.shortText ?? component.longText ?? "";
  }
  return component.short_name ?? component.long_name ?? "";
}

function findComponent(
  components: GoogleAddressComponent[],
  type: string,
): GoogleAddressComponent | undefined {
  return components.find((component) => component.types.includes(type));
}

function getFormattedAddressLine1(formattedAddress?: string): string {
  return formattedAddress?.split(",").map((part) => part.trim()).find(Boolean) ?? "";
}

export function getGoogleText(text: GoogleFormattableText | undefined): string {
  return text?.text ?? text?.toString?.() ?? "";
}

export function parseGooglePlaceAddress(
  place: GooglePlaceResult,
): Partial<StructuredOrganizationAddress> {
  const components = getAddressComponents(place);
  const streetNumber = getLongText(findComponent(components, "street_number"));
  const route = getLongText(findComponent(components, "route"));
  const premise = getLongText(findComponent(components, "premise"));
  const locality =
    getLongText(findComponent(components, "locality")) ||
    getLongText(findComponent(components, "postal_town")) ||
    getLongText(findComponent(components, "administrative_area_level_3")) ||
    place.postalAddress?.locality ||
    "";
  const state =
    getShortText(findComponent(components, "administrative_area_level_1")) ||
    place.postalAddress?.administrativeArea ||
    "";
  const postalCode =
    [
      getLongText(findComponent(components, "postal_code")),
      getLongText(findComponent(components, "postal_code_suffix")),
    ]
      .filter(Boolean)
      .join("-") ||
    place.postalAddress?.postalCode ||
    "";
  const country =
    getLongText(findComponent(components, "country")) ||
    place.postalAddress?.regionCode ||
    "";
  const addressLine1 =
    [streetNumber, route].filter(Boolean).join(" ").trim() ||
    place.postalAddress?.addressLines?.[0]?.trim() ||
    premise ||
    getFormattedAddressLine1(place.formattedAddress);

  return {
    addressLine1,
    addressCity: locality,
    addressState: state,
    addressPostalCode: postalCode,
    addressCountry: country,
  };
}
