/*
 * Runs before hydration so next-themes sees the preference handed across the
 * apex and organization-subdomain boundary on its first read. Keep the
 * constants aligned with src/lib/theme-preference.ts; architecture tests
 * enforce that contract.
 */
(function seedThemePreference() {
  try {
    var storageKey = "theme";
    var cookieName = "dg-theme";
    var parameterName = "theme";
    var validPreferences = ["light", "dark", "system"];
    var parameters = new URLSearchParams(location.search);
    var parameterPreference = parameters.get(parameterName);

    if (parameterPreference && validPreferences.indexOf(parameterPreference) > -1) {
      localStorage.setItem(storageKey, parameterPreference);
      parameters.delete(parameterName);
      var remainingParameters = parameters.toString();
      history.replaceState(
        null,
        "",
        location.pathname + (remainingParameters ? "?" + remainingParameters : "") + location.hash,
      );
      return;
    }

    var cookie = document.cookie.split("; ").filter(function isThemeCookie(entry) {
      return entry.indexOf(cookieName + "=") === 0;
    })[0];
    if (!cookie) return;

    var cookiePreference = decodeURIComponent(cookie.slice(cookieName.length + 1));
    if (
      validPreferences.indexOf(cookiePreference) > -1 &&
      localStorage.getItem(storageKey) !== cookiePreference
    ) {
      localStorage.setItem(storageKey, cookiePreference);
    }
  } catch (_error) {
    // Storage may be unavailable in hardened browsing contexts. Theme
    // initialization is best-effort and next-themes still has its fallback.
  }
})();
