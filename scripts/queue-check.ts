import IORedis from "ioredis";

// Same connection the app uses; every job is enqueued with a priority, so the
// "waiting" list is always empty and the prioritized set is where they sit.
const r = new IORedis(process.env.QUEUE_URL ?? "redis://localhost:6379");

const waiting = await r.llen("bull:library:wait");
const prioritized = await r.zcard("bull:library:prioritized");
const active = await r.llen("bull:library:active");
const completed = await r.zcard("bull:library:completed");
const failed = await r.zcard("bull:library:failed");

console.log({ waiting, prioritized, active, completed, failed });
await r.quit();
