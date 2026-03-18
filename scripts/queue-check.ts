import IORedis from "ioredis";

const r = new IORedis("redis://localhost:6379");

const waiting = await r.llen("bull:library:wait");
const active = await r.llen("bull:library:active");
const completed = await r.zcard("bull:library:completed");
const failed = await r.zcard("bull:library:failed");

console.log({ waiting, active, completed, failed });
await r.quit();
