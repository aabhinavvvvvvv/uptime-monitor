import { healthCheckWorker } from "./worker.js";

console.log("Worker started, listening on queue: health-check");

process.on("SIGTERM", async () => {
  await healthCheckWorker.close();
  process.exit(0);
});
