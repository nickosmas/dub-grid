import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import OrganizationLocationFields from "@/components/organization/OrganizationLocationFields";

function LocationFieldsHarness({
  addressLine2 = "",
}: {
  addressLine2?: string;
}) {
  const [value, setValue] = useState({
    phone: "",
    timezone: "",
    addressLine1: "",
    addressLine2,
    addressCity: "",
    addressState: "",
    addressPostalCode: "",
    addressCountry: "",
  });

  return (
    <>
      <OrganizationLocationFields
        value={value}
        onChange={(patch) => setValue((prev) => ({ ...prev, ...patch }))}
        showEmployeeCount={false}
      />
      <output data-testid="tz-value">{value.timezone}</output>
    </>
  );
}

function createGooglePlacesMock() {
  const fetchAutocompleteSuggestions = vi.fn(
    async ({ input }: { input: string }) => {
      const query = input.toLowerCase();

      if (query.includes("goog")) {
        return {
          suggestions: [
            {
              placePrediction: {
                text: { text: "Googleplex, Mountain View, CA, USA" },
                mainText: {
                  text: "Googleplex",
                  matches: [{ startOffset: 0, endOffset: 4 }],
                },
                secondaryText: {
                  text: "1600 Amphitheatre Pkwy, Mountain View, CA, USA",
                },
                toPlace: () => ({
                  fetchFields: vi.fn(async () => undefined),
                  formattedAddress:
                    "1600 Amphitheatre Pkwy, Mountain View, CA 94043, United States",
                  addressComponents: [
                    {
                      longText: "1600",
                      shortText: "1600",
                      types: ["street_number"],
                    },
                    {
                      longText: "Amphitheatre Pkwy",
                      shortText: "Amphitheatre Pkwy",
                      types: ["route"],
                    },
                    {
                      longText: "Mountain View",
                      shortText: "Mountain View",
                      types: ["locality"],
                    },
                    {
                      longText: "California",
                      shortText: "CA",
                      types: ["administrative_area_level_1"],
                    },
                    {
                      longText: "94043",
                      shortText: "94043",
                      types: ["postal_code"],
                    },
                    {
                      longText: "United States",
                      shortText: "US",
                      types: ["country"],
                    },
                  ],
                }),
              },
            },
          ],
        };
      }

      if (query.includes("1600")) {
        return {
          suggestions: [
            {
              placePrediction: {
                text: {
                  text: "1600 Amphitheatre Pkwy, Mountain View, CA, USA",
                },
                mainText: {
                  text: "1600 Amphitheatre Pkwy",
                  matches: [{ startOffset: 0, endOffset: 4 }],
                },
                secondaryText: {
                  text: "Mountain View, CA, USA",
                },
                toPlace: () => ({
                  fetchFields: vi.fn(async () => undefined),
                  formattedAddress:
                    "1600 Amphitheatre Pkwy, Mountain View, CA 94043, United States",
                  addressComponents: [
                    {
                      longText: "1600",
                      shortText: "1600",
                      types: ["street_number"],
                    },
                    {
                      longText: "Amphitheatre Pkwy",
                      shortText: "Amphitheatre Pkwy",
                      types: ["route"],
                    },
                    {
                      longText: "Mountain View",
                      shortText: "Mountain View",
                      types: ["locality"],
                    },
                    {
                      longText: "California",
                      shortText: "CA",
                      types: ["administrative_area_level_1"],
                    },
                    {
                      longText: "94043",
                      shortText: "94043",
                      types: ["postal_code"],
                    },
                    {
                      longText: "United States",
                      shortText: "US",
                      types: ["country"],
                    },
                  ],
                }),
              },
            },
          ],
        };
      }

      return { suggestions: [] };
    },
  );

  const importLibrary = vi.fn(async () => ({
    AutocompleteSuggestion: {
      fetchAutocompleteSuggestions,
    },
    AutocompleteSessionToken: class MockAutocompleteSessionToken {},
  }));

  (window as Window & { google?: unknown }).google = {
    maps: {
      importLibrary,
      event: {},
    },
  };

  return { fetchAutocompleteSuggestions, importLibrary };
}

const originalGoogleMapsKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

describe("OrganizationLocationFields", () => {
  beforeEach(() => {
    delete (window as Window & { google?: unknown }).google;
    delete process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  });

  afterEach(() => {
    if (originalGoogleMapsKey) {
      process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY =
        originalGoogleMapsKey;
    } else {
      delete process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    }

    delete (window as Window & { google?: unknown }).google;
  });

  it("falls back to manual entry when no Google Maps key is configured", async () => {
    const user = userEvent.setup();

    render(<LocationFieldsHarness />);

    const line1Input = screen.getByLabelText(/address line 1/i);
    await user.type(line1Input, "123 Main St");

    expect(line1Input).toHaveValue("123 Main St");
  });

  it("shows custom place-name recommendations and autofills structured fields on selection", async () => {
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY = "test-key";
    const { fetchAutocompleteSuggestions, importLibrary } =
      createGooglePlacesMock();
    const user = userEvent.setup();

    render(<LocationFieldsHarness addressLine2="Suite 12" />);

    const line1Input = screen.getByLabelText(/address line 1/i);
    await user.type(line1Input, "Goog");

    await waitFor(() =>
      expect(fetchAutocompleteSuggestions).toHaveBeenCalled(),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("listbox", { name: /address suggestions/i }),
      ).toBeInTheDocument(),
    );

    expect(screen.getByText(/powered by google/i)).toBeInTheDocument();
    expect(importLibrary).toHaveBeenCalledWith("places");

    await user.click(screen.getByRole("option", { name: /googleplex/i }));

    await waitFor(() =>
      expect(screen.getByLabelText(/address line 1/i)).toHaveValue(
        "1600 Amphitheatre Pkwy",
      ),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("listbox", { name: /address suggestions/i }),
      ).not.toBeInTheDocument(),
    );
    expect(screen.getByLabelText(/address line 2/i)).toHaveValue("Suite 12");
    expect(screen.getByLabelText(/^city$/i)).toHaveValue("Mountain View");
    expect(screen.getByLabelText(/state \/ province/i)).toHaveValue("CA");
    expect(screen.getByLabelText(/postal code/i)).toHaveValue("94043");
    expect(screen.getByLabelText(/country/i)).toHaveValue("United States");
    expect(screen.getByTestId("tz-value")).toHaveTextContent(
      "America/Los_Angeles",
    );
  });

  it("fills the right address fields after confirming an address recommendation", async () => {
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY = "test-key";
    createGooglePlacesMock();
    const user = userEvent.setup();

    render(<LocationFieldsHarness />);

    const line1Input = screen.getByLabelText(/address line 1/i);
    await user.type(line1Input, "1600");

    await waitFor(() =>
      expect(screen.getAllByRole("option")).toHaveLength(1),
    );

    expect(screen.getAllByRole("option")[0]).toHaveTextContent(
      "1600 Amphitheatre Pkwy",
    );

    await user.click(screen.getAllByRole("option")[0]);

    await waitFor(() =>
      expect(screen.getByLabelText(/address line 1/i)).toHaveValue(
        "1600 Amphitheatre Pkwy",
      ),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("listbox", { name: /address suggestions/i }),
      ).not.toBeInTheDocument(),
    );
    expect(screen.getByLabelText(/^city$/i)).toHaveValue("Mountain View");
    expect(screen.getByLabelText(/state \/ province/i)).toHaveValue("CA");
    expect(screen.getByLabelText(/postal code/i)).toHaveValue("94043");
    expect(screen.getByLabelText(/country/i)).toHaveValue("United States");
  });
});
