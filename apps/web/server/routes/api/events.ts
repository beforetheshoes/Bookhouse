import { defineEventHandler, createEventStream } from "h3";
import { getQueueEventsManager } from "../../utils/queue-events";

export default defineEventHandler(async (event) => {
  const stream = createEventStream(event);
  const manager = getQueueEventsManager();

  const unsubscribe = manager.subscribe((sseEvent) => {
    void stream.push({
      event: sseEvent.type,
      data: JSON.stringify(sseEvent.data),
    });
  });

  const heartbeat = setInterval(() => {
    void stream.push({ event: "heartbeat", data: "{}" });
  }, 30_000);

  stream.onClosed(() => {
    unsubscribe();
    clearInterval(heartbeat);
  });

  return stream.send();
});
