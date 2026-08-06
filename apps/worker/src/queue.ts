import { Queue } from "bullmq";
import { connection } from "./connection.js";

export const healthCheckQueue = new Queue("health-check", { connection });
