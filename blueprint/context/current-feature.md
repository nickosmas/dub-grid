# Auth-flow brand navigation

**Type:** Fix

**Status:** verified

## Problem

The brand icon on login-related screens is not consistently an escape route.
Users need a predictable way to return to the public landing page without
changing their authentication state.

## Fix

Make the existing web brand icon navigate to the landing page from every web
login, MFA, password recovery, invitation, verification, and
organization-selection auth screen. Do not change mobile. Preserve form state
and existing back, cancel, and sign-out behavior.

## Build steps

1. [x] Inventory the shared and route-local auth headers, make each visible brand
       icon an accessible landing-page link or press target, and add focused
       regression coverage where the project already tests the screen.

   Done when: every supported auth entry path returns to the landing page when
   the icon is activated, including keyboard activation on web.

## Verify

- Run focused web auth-screen tests plus type checks.
- Start the web app and verify the icon from sign-in and recovery routes returns
  to `/` without submitting or clearing form input.
