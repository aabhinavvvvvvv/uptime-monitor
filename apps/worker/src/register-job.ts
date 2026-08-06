import { prisma } from "@uptime/db";
import { healthCheckQueue } from "./queue.js";

const monitor = await prisma.monitor.findUniqueOrThrow({
  where: { id: "seed-monitor-1" },
});

await healthCheckQueue.upsertJobScheduler(
  monitor.id,
  { every: monitor.intervalSeconds * 1000 },
  { name: "check", data: { monitorId: monitor.id } },
);

console.log(`Registered repeatable check for "${monitor.name}" every ${monitor.intervalSeconds}s`);

await healthCheckQueue.close();
