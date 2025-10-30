import "./env";
import {
  S3Client,
  HeadObjectCommand,
  DeleteObjectsCommand,
} from "@aws-sdk/client-s3";
import { s3Localstorage } from "./core";

async function deleteOlderThanMinutes(
  bucket: string,
  minutes: number
): Promise<number> {
  console.log(
    `[DEBUG] Starting deleteOlderThanMinutes with bucket=${bucket}, minutes=${minutes}`
  );
  const cutoffTimestamp = Date.now() - minutes * 60 * 1000;
  console.log(
    `[DEBUG] Cutoff timestamp: ${cutoffTimestamp} (${new Date(
      cutoffTimestamp
    ).toISOString()})`
  );

  const candidateKeys: string[] = [];

  const concurrency = Number(process.env.HEAD_CONCURRENCY || 16);
  console.log(`[DEBUG] Using concurrency: ${concurrency}`);
  let inFlight: Promise<void>[] = [];
  const pushTask = (task: Promise<void>) => {
    inFlight.push(task);
    if (inFlight.length >= concurrency) {
      console.log(
        `[DEBUG] Reached concurrency limit (${concurrency}), waiting for batch to complete`
      );
      return Promise.all(inFlight).then(() => {
        console.log(
          `[DEBUG] Batch of ${concurrency} HEAD operations completed`
        );
        inFlight = [];
      });
    }
    return Promise.resolve();
  };

  console.log(`[DEBUG] Starting to list objects from storage`);
  let listedCount = 0;

  // s3Localstorage.list() is a generator in local package; cast to any to use here
  for await (const key of (
    s3Localstorage as any
  ).list() as AsyncIterable<string>) {
    listedCount++;
    if (listedCount % 100 === 0) {
      console.log(`[DEBUG] Listed ${listedCount} objects so far...`);
    }

    await pushTask(
      (async () => {
        try {
          console.log(`[DEBUG] HEAD request for key: ${key}`);
          const head = await s3Localstorage.s3Client.send(
            new HeadObjectCommand({ Bucket: bucket, Key: key })
          );
          console.log(`[DEBUG] HEAD response for ${key}:`, {
            lastModified: head.LastModified,
            size: head.ContentLength,
          });

          if (head.LastModified) {
            const lastModifiedTs = new Date(head.LastModified).getTime();
            console.log(
              `[DEBUG] ${key} lastModified: ${lastModifiedTs} (${head.LastModified.toISOString()})`
            );

            if (lastModifiedTs < cutoffTimestamp) {
              console.log(
                `[DEBUG] Adding ${key} to candidateKeys (older than cutoff)`
              );
              candidateKeys.push(key);
            } else {
              console.log(`[DEBUG] Skipping ${key} (newer than cutoff)`);
            }
          } else {
            console.warn(`[DEBUG] No LastModified for key: ${key}`);
          }
        } catch (error) {
          console.warn(
            "Failed to HEAD object",
            key,
            (error as Error).message || error
          );
        }
      })()
    );
  }

  console.log(`[DEBUG] Finished listing. Total objects listed: ${listedCount}`);

  if (inFlight.length > 0) {
    console.log(
      `[DEBUG] Waiting for remaining ${inFlight.length} HEAD operations to complete`
    );
    await Promise.all(inFlight);
    console.log(`[DEBUG] All remaining HEAD operations completed`);
  }

  console.log(
    `[DEBUG] Total candidate keys for deletion: ${candidateKeys.length}`
  );
  console.log(`[DEBUG] Candidate keys:`, candidateKeys.slice(0, 10)); // Log first 10 keys

  let deleted = 0;
  console.log(`[DEBUG] Starting deletion process in chunks of 1000`);

  for (let i = 0; i < candidateKeys.length; i += 1000) {
    const chunk = candidateKeys.slice(i, i + 1000);
    console.log(
      `[DEBUG] Processing deletion chunk ${Math.floor(i / 1000) + 1}, size: ${
        chunk.length
      } keys`
    );

    if (chunk.length === 0) {
      console.log(`[DEBUG] Empty chunk, skipping`);
      continue;
    }

    try {
      const chunkObjects = chunk.map((Key) => ({ Key }));
      console.log(
        `[DEBUG] Sending DeleteObjects command for ${chunk.length} objects`
      );

      const delResp = await s3Localstorage.s3Client.send(
        new DeleteObjectsCommand({
          Bucket: bucket,
          Delete: { Objects: chunkObjects, Quiet: true },
        })
      );

      const deletedNow = delResp.Deleted?.length || 0;
      deleted += deletedNow;
      console.log(
        `[DEBUG] Delete response: ${deletedNow} objects deleted in this chunk`
      );
      console.log(`Deleted ${deletedNow} objects (total: ${deleted})`);

      if (delResp.Errors && delResp.Errors.length > 0) {
        console.warn(
          `[DEBUG] DeleteObjects had ${delResp.Errors.length} errors:`,
          delResp.Errors
        );
      }
    } catch (error) {
      console.error("DeleteObjects failed", (error as Error).message || error);
      console.error(`[DEBUG] Failed chunk details:`, {
        chunkStart: i,
        chunkEnd: i + chunk.length,
        chunkSize: chunk.length,
      });
    }
  }

  console.log(`[DEBUG] Deletion process completed. Total deleted: ${deleted}`);
  return deleted;
}

export const handler = async () => {
  console.log(`[DEBUG] Handler started at ${new Date().toISOString()}`);
  const bucket = process.env.YTDL_STORAGE_BUCKET || process.env.BUCKET_NAME;
  if (!bucket) {
    console.error(
      `[DEBUG] Bucket environment variables not found. YTDL_STORAGE_BUCKET: ${process.env.YTDL_STORAGE_BUCKET}, BUCKET_NAME: ${process.env.BUCKET_NAME}`
    );
    throw new Error("YTDL_STORAGE_BUCKET or BUCKET_NAME env is required");
  }
  const minutes = Number(process.env.CLEANUP_MINUTES || 60);
  console.log(
    `Starting cleanup for bucket=${bucket}, older than ${minutes} minutes`
  );

  const deleted = await deleteOlderThanMinutes(bucket, minutes);
  console.log(`Cleanup completed. Deleted: ${deleted}`);

  console.log(`[DEBUG] Handler completed at ${new Date().toISOString()}`);
  return { statusCode: 200, body: `Deleted ${deleted} objects` };
};
