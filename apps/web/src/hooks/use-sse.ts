import { useEffect, useRef, useCallback } from "react";
import { useRouter } from "@tanstack/react-router";

interface UseSSEOptions {
  enabled?: boolean;
}

// Every event re-runs the whole route loader (works, facets, shelves,
// progress); during a scan that fired every 2s and the library never stopped
// re-rendering. 5s keeps the page live without the churn.
const THROTTLE_MS = 5000;

export function useSSE({ enabled = true }: UseSSEOptions = {}) {
  const router = useRouter();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef(false);
  const lastCallRef = useRef(0);

  const throttledInvalidate = useCallback(() => {
    const now = Date.now();
    const elapsed = now - lastCallRef.current;

    if (elapsed >= THROTTLE_MS) {
      lastCallRef.current = now;
      void router.invalidate();
    } else {
      pendingRef.current = true;
      if (timerRef.current === null) {
        timerRef.current = setTimeout(() => {
          timerRef.current = null;
          pendingRef.current = false;
          lastCallRef.current = Date.now();
          void router.invalidate();
        }, THROTTLE_MS - elapsed);
      }
    }
  }, [router]);

  useEffect(() => {
    if (!enabled) return;

    const es = new EventSource("/api/events");

    const eventTypes = ["job:completed", "job:failed", "job:active", "job:progress"];

    for (const type of eventTypes) {
      es.addEventListener(type, throttledInvalidate);
    }

    es.onerror = () => {
      // EventSource auto-reconnects natively
    };

    return () => {
      es.close();
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      pendingRef.current = false;
    };
  }, [enabled, throttledInvalidate]);
}
