import { Worker } from "bullmq";
import { prisma } from "@uptime/db";
import { connection } from "./connection.js";
import { checkUrl } from "./check.js";

interface HealthCheckJobData {
  monitorId: string;
}

export const healthCheckWorker = new Worker<HealthCheckJobData>(
  "health-check",
  async (job) => {
    const monitor = await prisma.monitor.findUniqueOrThrow({
      where: { id: job.data.monitorId },
    });

    const result = await checkUrl(monitor.url, monitor.method, monitor.expectedStatus, monitor.timeoutMs);

    await prisma.check.create({
      data: {
        monitorId: monitor.id,
        statusCode: result.statusCode,
        responseTimeMs: result.responseTimeMs,
        success: result.success,
        errorMessage: result.errorMessage,
      },
    });

    console.log(
      `[${monitor.name}] ${result.success ? "UP" : "DOWN"} — ${result.responseTimeMs}ms` +
        (result.errorMessage ? ` (${result.errorMessage})` : ""),
    );
  },
  { connection },
);

healthCheckWorker.on("failed", (job, err) => {
  console.error(`Job ${job?.id} failed:`, err);
});
