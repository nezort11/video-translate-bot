import { Queue, Worker, Job } from "bullmq";
import { Update } from "telegraf/types";
import { REDIS_URL, USE_QUEUE } from "../env";
import { logger } from "../logger";
import { bot } from "../bot";
import IORedis from "ioredis";

const QUEUE_NAME = "telegram-updates";

let queue: Queue | null = null;
let worker: Worker | null = null;
let redisConnection: IORedis | null = null;

export const initQueue = () => {
  if (!USE_QUEUE || !REDIS_URL) return;

  logger.info(`Initializing update queue (Redis: ${REDIS_URL})`);

  redisConnection = new IORedis(REDIS_URL, {
    maxRetriesPerRequest: null,
  });

  queue = new Queue(QUEUE_NAME, {
    connection: redisConnection,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 1000,
      },
      removeOnComplete: true,
      removeOnFail: false,
    },
  });

  queue.on("error", (err) => {
    logger.error("Queue error:", err);
  });
};

export const initWorker = () => {
  if (!USE_QUEUE || !REDIS_URL) return;

  logger.info(`Initializing update worker (Redis: ${REDIS_URL})`);

  if (!redisConnection) {
    redisConnection = new IORedis(REDIS_URL, {
      maxRetriesPerRequest: null,
    });
  }

  worker = new Worker(
    QUEUE_NAME,
    async (job: Job<{ update: Update }>) => {
      const { update } = job.data;
      logger.info(
        `Processing update ${update.update_id} from queue (Job: ${job.id})`
      );
      try {
        await bot.handleUpdate(update);
      } catch (error) {
        logger.error(`Error processing update ${update.update_id}:`, error);
        throw error;
      }
    },
    {
      connection: redisConnection,
      concurrency: 5, // Process up to 5 updates in parallel
    }
  );

  worker.on("completed", (job) => {
    logger.info(`Job ${job.id} completed successfully`);
  });

  worker.on("failed", (job, err) => {
    logger.error(`Job ${job?.id} failed:`, err);
  });
};

export const pushUpdateToQueue = async (update: Update) => {
  if (!queue) {
    if (USE_QUEUE) {
      logger.warn("Queue not initialized, processing update directly");
      await bot.handleUpdate(update);
    }
    return;
  }

  await queue.add(`update-${update.update_id}`, { update });
  logger.info(`Update ${update.update_id} pushed to queue`);
};

export const stopQueue = async () => {
  if (worker) await worker.close();
  if (queue) await queue.close();
  if (redisConnection) redisConnection.disconnect();
};
