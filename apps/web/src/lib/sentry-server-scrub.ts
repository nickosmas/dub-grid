interface ScrubbableEvent {
  user?: { id?: unknown } | null;
  request?: { data?: unknown };
}

/**
 * Server and edge events keep the user's id and drop request bodies, which can
 * hold names, emails and phone numbers (F-207). Secrets are already redacted by
 * the capture helpers; this covers what Sentry attaches on its own.
 */
export function scrubServerEvent<E extends ScrubbableEvent>(event: E): E {
  const view: ScrubbableEvent = event;
  if (view.user) {
    view.user = view.user.id === undefined ? {} : { id: view.user.id };
  }
  if (view.request) {
    delete view.request.data;
  }
  return event;
}
