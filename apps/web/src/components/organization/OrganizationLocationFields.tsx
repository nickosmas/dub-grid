"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { MapPin } from "lucide-react";
import { labelStyle } from "@/lib/styles";
import type { StructuredOrganizationAddress } from "@/lib/organization-profile";
import {
  getGoogleText,
  loadGooglePlacesLibrary,
  parseGooglePlaceAddress,
  readGoogleLatLng,
  type GoogleAutocompleteSuggestion,
  type GoogleFormattableText,
  type GooglePlacePrediction,
  type GooglePlacesLibrary,
} from "./google-maps";
import { getTimezoneForCoords } from "@/lib/timezone-from-coords";
import { getTimezoneForUsState } from "@/lib/us-state-timezones";
import TimezoneSelect from "./TimezoneSelect";

export interface OrganizationLocationFormValue
  extends StructuredOrganizationAddress {
  phone: string;
  timezone: string;
}

interface OrganizationLocationFieldsProps {
  value: OrganizationLocationFormValue;
  onChange: (patch: Partial<OrganizationLocationFormValue>) => void;
  phoneError?: string | null;
  employeeCount?: number | null;
  employeeCountLoading?: boolean;
  showEmployeeCount?: boolean;
  gridTemplateColumns?: string;
}

function HighlightedGoogleText({
  value,
}: {
  value: GoogleFormattableText | undefined;
}) {
  const text = getGoogleText(value);
  const matches = value?.matches ?? [];

  if (!text) return null;
  if (matches.length === 0) return <>{text}</>;

  const chars = Array.from(text);
  const segments: ReactNode[] = [];
  let cursor = 0;

  matches.forEach((match, index) => {
    const start = Math.max(0, Math.min(chars.length, match.startOffset));
    const end = Math.max(start, Math.min(chars.length, match.endOffset));

    if (start > cursor) {
      segments.push(
        <span key={`plain-${index}-${cursor}`}>
          {chars.slice(cursor, start).join("")}
        </span>,
      );
    }

    if (end > start) {
      segments.push(
        <span key={`match-${index}-${start}`} className="dg-address-match">
          {chars.slice(start, end).join("")}
        </span>,
      );
    }

    cursor = end;
  });

  if (cursor < chars.length) {
    segments.push(
      <span key={`tail-${cursor}`}>{chars.slice(cursor).join("")}</span>,
    );
  }

  return <>{segments}</>;
}

type AddressAutofillPatch = Partial<StructuredOrganizationAddress> & {
  timezone?: string;
};

function AddressLine1Input({
  id,
  value,
  onChange,
  onAutofill,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  onAutofill: (patch: AddressAutofillPatch) => void;
}) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const inputRef = useRef<HTMLInputElement>(null);
  const blurTimeoutRef = useRef<number | null>(null);
  const requestIdRef = useRef(0);
  const skipNextFetchRef = useRef(false);
  const skipNextPanelOpenRef = useRef(false);
  const sessionTokenRef = useRef<object | null>(null);

  const [placesLibrary, setPlacesLibrary] = useState<GooglePlacesLibrary | null>(
    null,
  );
  const [panelOpen, setPanelOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [panelStyle, setPanelStyle] = useState<CSSProperties>({});
  const [suggestions, setSuggestions] = useState<GoogleAutocompleteSuggestion[]>(
    [],
  );

  const query = value.trim();
  const hasAutocomplete = Boolean(apiKey && placesLibrary);
  const showPanel =
    hasAutocomplete && panelOpen && (query.length >= 2 || loading);

  const updatePanelPosition = useCallback(() => {
    if (!inputRef.current || typeof window === "undefined") return;

    const rect = inputRef.current.getBoundingClientRect();
    const viewportPadding = 12;
    const preferredHeight = 320;
    const spaceBelow = window.innerHeight - rect.bottom - viewportPadding;
    const spaceAbove = rect.top - viewportPadding;
    const openAbove = spaceBelow < 220 && spaceAbove > spaceBelow;
    const maxHeight = Math.max(
      160,
      Math.min(preferredHeight, openAbove ? spaceAbove : spaceBelow),
    );

    setPanelStyle({
      position: "fixed",
      top: openAbove ? "auto" : rect.bottom + 8,
      bottom: openAbove ? window.innerHeight - rect.top + 8 : "auto",
      left: rect.left,
      width: rect.width,
      maxHeight,
      zIndex: 10100,
      right: "auto",
    });
  }, []);

  const closePanel = useCallback((clearSuggestions = false) => {
    requestIdRef.current += 1;
    setPanelOpen(false);
    setLoading(false);

    if (clearSuggestions) {
      setSuggestions([]);
      setActiveIndex(0);
      sessionTokenRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!apiKey) return;

    let cancelled = false;

    void loadGooglePlacesLibrary(apiKey).then((library) => {
      if (!cancelled) setPlacesLibrary(library);
    });

    return () => {
      cancelled = true;
    };
  }, [apiKey]);

  useEffect(() => {
    if (skipNextPanelOpenRef.current) {
      skipNextPanelOpenRef.current = false;
      return;
    }

    if (
      hasAutocomplete &&
      query.length >= 2 &&
      inputRef.current === document.activeElement
    ) {
      const frame = window.requestAnimationFrame(() => {
        updatePanelPosition();
        setPanelOpen(true);
      });

      return () => {
        window.cancelAnimationFrame(frame);
      };
    }
  }, [hasAutocomplete, query, updatePanelPosition]);

  useEffect(() => {
    const autocompleteLibrary = placesLibrary;

    if (!hasAutocomplete || !panelOpen || query.length < 2 || !autocompleteLibrary) return;

    if (skipNextFetchRef.current) {
      skipNextFetchRef.current = false;
      return;
    }

    const currentRequestId = requestIdRef.current + 1;
    requestIdRef.current = currentRequestId;
    const timer = window.setTimeout(() => {
      setLoading(true);
      if (!sessionTokenRef.current) {
        sessionTokenRef.current = new autocompleteLibrary.AutocompleteSessionToken();
      }

      void autocompleteLibrary.AutocompleteSuggestion.fetchAutocompleteSuggestions({
        input: query,
        language:
          typeof navigator !== "undefined" ? navigator.language : undefined,
        sessionToken: sessionTokenRef.current,
      })
        .then(({ suggestions: nextSuggestions }) => {
          if (requestIdRef.current !== currentRequestId) return;

          const predictions = nextSuggestions
            .filter(
              (
                suggestion,
              ): suggestion is GoogleAutocompleteSuggestion & {
                placePrediction: GooglePlacePrediction;
              } => Boolean(suggestion.placePrediction),
            )
            .slice(0, 6);

          setSuggestions(predictions);
          setActiveIndex(0);
        })
        .catch(() => {
          if (requestIdRef.current !== currentRequestId) return;
          setSuggestions([]);
        })
        .finally(() => {
          if (requestIdRef.current === currentRequestId) {
            setLoading(false);
          }
        });
    }, 160);

    return () => {
      window.clearTimeout(timer);
    };
  }, [hasAutocomplete, panelOpen, placesLibrary, query]);

  useEffect(() => {
    return () => {
      if (blurTimeoutRef.current !== null) {
        window.clearTimeout(blurTimeoutRef.current);
      }
    };
  }, []);

  useLayoutEffect(() => {
    if (showPanel) {
      updatePanelPosition();
    }
  }, [showPanel, updatePanelPosition, suggestions.length, loading]);

  useEffect(() => {
    if (!showPanel) return;

    window.addEventListener("resize", updatePanelPosition);
    window.addEventListener("scroll", updatePanelPosition, true);
    return () => {
      window.removeEventListener("resize", updatePanelPosition);
      window.removeEventListener("scroll", updatePanelPosition, true);
    };
  }, [showPanel, updatePanelPosition]);

  async function handleSelectPrediction(prediction: GooglePlacePrediction) {
    if (!placesLibrary) return;

    try {
      const place = prediction.toPlace();
      await place.fetchFields({
        fields: [
          "addressComponents",
          "formattedAddress",
          "displayName",
          "postalAddress",
          "location",
        ],
      });

      const patch = parseGooglePlaceAddress(place);
      const coords = readGoogleLatLng(place.location);
      const timezone =
        getTimezoneForUsState(patch.addressState) ??
        getTimezoneForCoords(coords?.latitude, coords?.longitude);

      skipNextFetchRef.current = true;
      skipNextPanelOpenRef.current = true;
      sessionTokenRef.current = new placesLibrary.AutocompleteSessionToken();
      closePanel(true);

      if (patch.addressLine1) onChange(patch.addressLine1);
      onAutofill(timezone ? { ...patch, timezone } : patch);
    } catch {
      closePanel();
    }
  }

  function handleInputValue(nextValue: string) {
    onChange(nextValue);

    if (blurTimeoutRef.current !== null) {
      window.clearTimeout(blurTimeoutRef.current);
      blurTimeoutRef.current = null;
    }

    setActiveIndex(0);
    const nextQuery = nextValue.trim();

    if (!nextQuery) {
      closePanel(true);
      return;
    }

    if (nextQuery.length < 2 || !hasAutocomplete) {
      setSuggestions([]);
      setLoading(false);
      sessionTokenRef.current = null;
      setPanelOpen(false);
      return;
    }

    if (hasAutocomplete) {
      updatePanelPosition();
      setPanelOpen(true);
      return;
    }
  }

  return (
    <div className="dg-address-autocomplete">
      <input
        id={id}
        ref={inputRef}
        className="dg-input"
        value={value}
        onChange={(event) => handleInputValue(event.target.value)}
        onFocus={() => {
          if (query.length >= 2 && hasAutocomplete) {
            updatePanelPosition();
            setPanelOpen(true);
          }
        }}
        onBlur={() => {
          blurTimeoutRef.current = window.setTimeout(() => {
            closePanel();
          }, 120);
        }}
        onKeyDown={(event) => {
          if (!showPanel) return;

          if (event.key === "ArrowDown") {
            event.preventDefault();
            setActiveIndex((prev) =>
              Math.min(prev + 1, Math.max(suggestions.length - 1, 0)),
            );
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setActiveIndex((prev) => Math.max(prev - 1, 0));
          } else if (event.key === "Enter") {
            const selected = suggestions[activeIndex]?.placePrediction;
            if (!selected) return;
            event.preventDefault();
            void handleSelectPrediction(selected);
          } else if (event.key === "Escape") {
            event.preventDefault();
            closePanel();
          }
        }}
        placeholder="Search a place or address"
        autoComplete="address-line1"
        maxLength={120}
        role="combobox"
        aria-expanded={showPanel}
        aria-autocomplete="list"
        aria-controls={showPanel ? `${id}-suggestions` : undefined}
        aria-activedescendant={
          showPanel && suggestions[activeIndex]
            ? `${id}-option-${activeIndex}`
            : undefined
        }
      />

      {showPanel && typeof document !== "undefined"
        ? createPortal(
        <div className="dg-address-panel" style={panelStyle}>
          <div
            id={`${id}-suggestions`}
            className="dg-address-panel-list"
            role="listbox"
            aria-label="Address suggestions"
          >
            {loading ? (
              <div className="dg-address-state">Looking up places…</div>
            ) : suggestions.length === 0 ? (
              <div className="dg-address-state">
                No matching places yet. Keep typing for a more exact address.
              </div>
            ) : (
              suggestions.map((suggestion, index) => {
                const prediction = suggestion.placePrediction;
                if (!prediction) return null;

                const title = prediction.mainText ?? prediction.text;
                const subtitle = prediction.secondaryText;
                const isActive = activeIndex === index;

                return (
                  <button
                    key={`${getGoogleText(prediction.text)}-${index}`}
                    id={`${id}-option-${index}`}
                    type="button"
                    role="option"
                    aria-selected={isActive}
                    className="dg-address-item"
                    onMouseDown={(event) => event.preventDefault()}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => {
                      void handleSelectPrediction(prediction);
                    }}
                  >
                    <span className="dg-address-item-icon" aria-hidden="true">
                      <MapPin size={14} strokeWidth={2.2} />
                    </span>
                    <span className="dg-address-item-copy">
                      <span className="dg-address-item-title">
                        <HighlightedGoogleText value={title} />
                      </span>
                      {subtitle && getGoogleText(subtitle) ? (
                        <span className="dg-address-item-subtitle">
                          <HighlightedGoogleText value={subtitle} />
                        </span>
                      ) : null}
                    </span>
                  </button>
                );
              })
            )}
          </div>
          <div className="dg-address-panel-foot">
            <span className="dg-address-panel-attribution">Powered by Google</span>
          </div>
        </div>,
        document.body,
      )
        : null}
    </div>
  );
}

export default function OrganizationLocationFields({
  value,
  onChange,
  phoneError = null,
  employeeCount,
  employeeCountLoading,
  showEmployeeCount = true,
  gridTemplateColumns = "1fr 1fr",
}: OrganizationLocationFieldsProps) {
  const idBase = useId();

  return (
    <div style={{ display: "grid", gridTemplateColumns, gap: 16 }}>
      <div>
        <label htmlFor={`${idBase}-phone`} style={labelStyle}>
          Phone
        </label>
        <input
          id={`${idBase}-phone`}
          className="dg-input"
          value={value.phone}
          onChange={(event) => onChange({ phone: event.target.value })}
          placeholder="(415) 555-0100"
          autoComplete="tel"
          maxLength={20}
        />
        {phoneError ? (
          <p
            role="alert"
            style={{
              margin: "6px 0 0",
              fontSize: "var(--dg-fs-footnote)",
              color: "var(--color-danger)",
            }}
          >
            {phoneError}
          </p>
        ) : null}
      </div>
      {showEmployeeCount && (
        <div>
          <label htmlFor={`${idBase}-employees`} style={labelStyle}>
            Employees
          </label>
          <input
            id={`${idBase}-employees`}
            className="dg-input"
            value={employeeCountLoading ? "Loading…" : String(employeeCount ?? 0)}
            readOnly
            aria-readonly="true"
          />
        </div>
      )}
      <div style={{ gridColumn: "1 / -1" }}>
        <label htmlFor={`${idBase}-address-line-1`} style={labelStyle}>
          Address Line 1
        </label>
        <AddressLine1Input
          id={`${idBase}-address-line-1`}
          value={value.addressLine1}
          onChange={(addressLine1) => onChange({ addressLine1 })}
          onAutofill={(patch) => onChange(patch)}
        />
      </div>
      <div style={{ gridColumn: "1 / -1" }}>
        <label htmlFor={`${idBase}-address-line-2`} style={labelStyle}>
          Address Line 2
        </label>
        <input
          id={`${idBase}-address-line-2`}
          className="dg-input"
          value={value.addressLine2}
          onChange={(event) => onChange({ addressLine2: event.target.value })}
          placeholder="Suite, floor, building, or unit"
          autoComplete="address-line2"
          maxLength={120}
        />
      </div>
      <div>
        <label htmlFor={`${idBase}-city`} style={labelStyle}>
          City
        </label>
        <input
          id={`${idBase}-city`}
          className="dg-input"
          value={value.addressCity}
          onChange={(event) => onChange({ addressCity: event.target.value })}
          autoComplete="address-level2"
          maxLength={80}
        />
      </div>
      <div>
        <label htmlFor={`${idBase}-state`} style={labelStyle}>
          State / Province
        </label>
        <input
          id={`${idBase}-state`}
          className="dg-input"
          value={value.addressState}
          onChange={(event) => onChange({ addressState: event.target.value })}
          autoComplete="address-level1"
          maxLength={80}
        />
      </div>
      <div>
        <label htmlFor={`${idBase}-postal-code`} style={labelStyle}>
          Postal Code
        </label>
        <input
          id={`${idBase}-postal-code`}
          className="dg-input"
          value={value.addressPostalCode}
          onChange={(event) =>
            onChange({ addressPostalCode: event.target.value })
          }
          autoComplete="postal-code"
          maxLength={20}
        />
      </div>
      <div>
        <label htmlFor={`${idBase}-country`} style={labelStyle}>
          Country
        </label>
        <input
          id={`${idBase}-country`}
          className="dg-input"
          value={value.addressCountry}
          onChange={(event) => onChange({ addressCountry: event.target.value })}
          autoComplete="country-name"
          maxLength={80}
        />
      </div>
      <div style={{ gridColumn: "1 / -1" }}>
        <label htmlFor={`${idBase}-timezone`} style={labelStyle}>
          Time Zone
        </label>
        <TimezoneSelect
          id={`${idBase}-timezone`}
          value={value.timezone}
          onChange={(timezone) => onChange({ timezone })}
          style={{ width: "100%" }}
        />
      </div>
    </div>
  );
}
