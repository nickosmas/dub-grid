import { useEffect, useState } from "react";
import {
  AppState,
  type AppStateStatus,
} from "react-native";

const MINUTE_IN_MS = 60 * 1000;

function getMillisecondsUntilNextMinute(value: Date): number {
  const millisecondsIntoMinute =
    value.getSeconds() * 1000 + value.getMilliseconds();

  return millisecondsIntoMinute === 0
    ? MINUTE_IN_MS
    : MINUTE_IN_MS - millisecondsIntoMinute;
}

export function useRealtimeNow(): Date {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout> | null = null;

    function clearScheduledTick() {
      if (timeout != null) {
        clearTimeout(timeout);
        timeout = null;
      }
    }

    function scheduleNextTick() {
      clearScheduledTick();
      timeout = setTimeout(() => {
        setNow(new Date());
        scheduleNextTick();
      }, getMillisecondsUntilNextMinute(new Date()));
    }

    function syncNow() {
      setNow(new Date());
      scheduleNextTick();
    }

    scheduleNextTick();

    const subscription = AppState.addEventListener(
      "change",
      (nextState: AppStateStatus) => {
        if (nextState === "active") {
          syncNow();
        }
      },
    );

    return () => {
      clearScheduledTick();
      subscription.remove();
    };
  }, []);

  return now;
}
