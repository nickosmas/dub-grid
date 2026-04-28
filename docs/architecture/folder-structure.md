# Folder Structure

DubGrid is moving toward a software-centric, domain-first layout.

Current first-pass conventions:

- `apps/web/src/features/*`
  - domain-first web and backend modules, including mobile API server handlers and permissions logic
- `apps/mobile/src/features/*`
  - mobile product code grouped by business capability such as `auth`, `schedule`, `shift-requests`, `notifications`, `people`, and `profile`
- `apps/mobile/src/shared/*`
  - cross-feature mobile building blocks such as API clients, Supabase session helpers, providers, and shared UI shells
- `apps/web/src/features/mobile/server/*`
  - bearer-token mobile API auth, data access, push delivery, and route handlers for `/api/mobile/v1/*`
- `apps/web/src/features/notifications/server/*`
  - notification dispatch and notification delivery orchestration
- `apps/web/src/features/permissions/*`
  - RBAC and permission context building

Compatibility shims still exist under older paths such as `apps/web/src/lib/*` and the Next route files under `apps/web/src/app/api/*`.
Those wrappers are intentional for launch safety so we can improve structure without forcing the entire app to move in one step.

Near-term migration rule:

- Put new feature-specific code inside a feature folder first.
- Use `shared` only for code that is truly cross-feature.
- Keep route files thin and delegate behavior to feature modules.
