import "./env";
import {
  S3Client,
  HeadObjectCommand,
  DeleteObjectsCommand,
} from "@aws-sdk/client-s3";
import { s3Localstorage } from "./core";
import { logger } from "./logger";

async function deleteOlderThanMinutes(
  bucket: string,
  minutes: number
): Promise<number> {
  logger.info(
    `Starting deleteOlderThanMinutes with bucket=${bucket}, minutes=${minutes}`
  );
  const cutoffTimestamp = Date.now() - minutes * 60 * 1000;
  logger.info(
    `Cutoff timestamp: ${cutoffTimestamp} (${new Date(cutoffTimestamp).toISOString()})`
  );

  const candidateKeys: string[] = [];

  const concurrency = Number(process.env.HEAD_CONCURRENCY || 16);
  logger.info(`Using concurrency: ${concurrency}`);
  let inFlight: Promise<void>[] = [];
  const pushTask = (task: Promise<void>) => {
    inFlight.push(task);
    if (inFlight.length >= concurrency) {
      logger.info(
        `Reached concurrency limit (${concurrency}), waiting for batch to complete`
      );
      return Promise.all(inFlight).then(() => {
        logger.info(`Batch of ${concurrency} HEAD operations completed`);
        inFlight = [];
      });
    }
    return Promise.resolve();
  };

  logger.info(`Starting to list objects from storage`);
  let listedCount = 0;

  // s3Localstorage.list() is a generator in local package; cast to any to use here
  for await (const key of (
    s3Localstorage as any
  ).list() as AsyncIterable<string>) {
    listedCount++;
    if (listedCount % 100 === 0) {
      logger.info(`Listed ${listedCount} objects so far...`);
    }

    await pushTask(
      (async () => {
        try {
          logger.info(`HEAD request for key: ${key}`);
          const head = await s3Localstorage.s3Client.send(
            new HeadObjectCommand({ Bucket: bucket, Key: key })
          );
          logger.info(`HEAD response for ${key}:`, {
            lastModified: head.LastModified,
            size: head.ContentLength,
          });

          if (head.LastModified) {
            const lastModifiedTs = new Date(head.LastModified).getTime();
            logger.info(
              `${key} lastModified: ${lastModifiedTs} (${head.LastModified.toISOString()})`
            );

            if (lastModifiedTs < cutoffTimestamp) {
              logger.info(`Adding ${key} to candidateKeys (older than cutoff)`);
              candidateKeys.push(key);
            } else {
              logger.info(`Skipping ${key} (newer than cutoff)`);
            }
          } else {
            logger.warn(`No LastModified for key: ${key}`);
          }
        } catch (error) {
          logger.warn(
            "Failed to HEAD object",
            key,
            (error as Error).message || error
          );
        }
      })()
    );
  }

  logger.info(`Finished listing. Total objects listed: ${listedCount}`);

  if (inFlight.length > 0) {
    logger.info(
      `Waiting for remaining ${inFlight.length} HEAD operations to complete`
    );
    await Promise.all(inFlight);
    logger.info(`All remaining HEAD operations completed`);
  }

  logger.info(`Total candidate keys for deletion: ${candidateKeys.length}`);
  logger.info(`Candidate keys:`, candidateKeys.slice(0, 10)); // Log first 10 keys

  let deleted = 0;
  logger.info(`Starting deletion process in chunks of 1000`);

  for (let i = 0; i < candidateKeys.length; i += 1000) {
    const chunk = candidateKeys.slice(i, i + 1000);
    logger.info(
      `Processing deletion chunk ${Math.floor(i / 1000) + 1}, size: ${chunk.length} keys`
    );

    if (chunk.length === 0) {
      logger.info(`Empty chunk, skipping`);
      continue;
    }

    try {
      const chunkObjects = chunk.map((Key) => ({ Key }));
      logger.info(`Sending DeleteObjects command for ${chunk.length} objects`);

      const delResp = await s3Localstorage.s3Client.send(
        new DeleteObjectsCommand({
          Bucket: bucket,
          Delete: { Objects: chunkObjects },
        })
      );

      const deletedNow =
        (delResp.Deleted && delResp.Deleted.length) !== undefined
          ? (delResp.Deleted?.length as number)
          : Math.max(0, chunk.length - (delResp.Errors?.length || 0));
      deleted += deletedNow;
      logger.info(
        `Delete response: ${deletedNow} objects deleted in this chunk`
      );
      logger.info(`Deleted ${deletedNow} objects (total: ${deleted})`);

      if (delResp.Errors && delResp.Errors.length > 0) {
        logger.warn(
          `DeleteObjects had ${delResp.Errors.length} errors:`,
          delResp.Errors
        );
      }
    } catch (error) {
      logger.error("DeleteObjects failed", (error as Error).message || error);
      logger.error(`Failed chunk details:`, {
        chunkStart: i,
        chunkEnd: i + chunk.length,
        chunkSize: chunk.length,
      });
    }
  }

  logger.info(`Deletion process completed. Total deleted: ${deleted}`);
  return deleted;
}

export const handler = async () => {
  logger.info(`Handler started at ${new Date().toISOString()}`);
  const bucket = process.env.YTDL_STORAGE_BUCKET || process.env.BUCKET_NAME;
  if (!bucket) {
    logger.error(
      `Bucket environment variables not found. YTDL_STORAGE_BUCKET: ${process.env.YTDL_STORAGE_BUCKET}, BUCKET_NAME: ${process.env.BUCKET_NAME}`
    );
    throw new Error("YTDL_STORAGE_BUCKET or BUCKET_NAME env is required");
  }
  const minutes = Number(process.env.CLEANUP_MINUTES || 60);
  logger.info(
    `Starting cleanup for bucket=${bucket}, older than ${minutes} minutes`
  );

  const deleted = await deleteOlderThanMinutes(bucket, minutes);
  logger.info(`Cleanup completed. Deleted: ${deleted}`);

  logger.info(`Handler completed at ${new Date().toISOString()}`);
  return { statusCode: 200, body: `Deleted ${deleted} objects` };
};
