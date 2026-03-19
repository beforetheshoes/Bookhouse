import { useEffect } from "react";
import { useRouter } from "@tanstack/react-router";

interface UseSSEOptions {
  enabled?: boolean;
}

export function useSSE({ enabled = true }: UseSSEOptions = {}) {
  const router = useRouter();

  useEffect(() => {
    if (!enabled) return;

    const es = new EventSource("/api/events");

    const eventTypes = ["job:completed", "job:failed", "job:active", "job:progress"];

    const handler = () => {
      void router.invalidate();
    };

    for (const type of eventTypes) {
      es.addEventListener(type, handler);
    }

    es.onerror = () => {
      // EventSource auto-reconnects natively
    };

    return () => {
      es.close();
    };
  }, [enabled, router]);
}
