import { after } from "next/server";
import { dispatchNotificationEvent, type NotificationEvent } from "./events";

/** Sends an alert once the response is out, so a slow send never holds up the caller. */
export function dispatchNotificationEventAfterResponse(
  actorUserId: string,
  event: NotificationEvent,
): void {
  after(() => dispatchNotificationEvent(actorUserId, event));
}
