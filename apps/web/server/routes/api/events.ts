import { defineEventHandler, createEventStream, getSession, createError } from "h3";
import { getQueueEventsManager } from "../../utils/queue-events";
import { authSessionConfig } from "../../../src/lib/auth-server";

export default defineEventHandler(async (event) => {
  // Validate auth
  const session = await getSession(event, authSessionConfig);
  if (!session.data?.userId) {
    throw createError({ statusCode: 401, statusMessage: "Unauthorized" });
  }

  const stream = createEventStream(event);
  const manager = getQueueEventsManager();

  // Subscribe to queue events and forward to SSE stream
  const unsubscribe = manager.subscribe((sseEvent) => {
    stream.push({
      event: sseEvent.type,
      data: JSON.stringify(sseEvent.data),
    });
  });

  // Heartbeat every 30s to keep connection alive
  const heartbeat = setInterval(() => {
    stream.push({ event: "heartbeat", data: "{}" });
  }, 30_000);

  // Clean up on disconnect
  stream.onClosed(() => {
    unsubscribe();
    clearInterval(heartbeat);
  });

  return stream.send();
});
