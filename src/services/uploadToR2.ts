import fs from "node:fs";
import path from "node:path";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import type { AppConfig } from "../config.js";
import type { TaggedTimelapse } from "./tagTimelapses.js";

function buildClient(config: AppConfig): S3Client {
  return new S3Client({
    region: "auto",
    endpoint: `https://${config.r2.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: config.r2.accessKeyId,
      secretAccessKey: config.r2.secretAccessKey
    }
  });
}

function objectKeys(prefix: string, item: TaggedTimelapse): {
  videoKey: string;
  metadataKey: string;
} {
  const fileName = path.basename(item.stagedPath);
  const metadataFileName = `${fileName}.json`;
  const base = `${prefix}/${item.printerId}`.replace(/\/+/g, "/");

  return {
    videoKey: `${base}/${fileName}`,
    metadataKey: `${base}/${metadataFileName}`
  };
}

export async function uploadToR2(
  config: AppConfig,
  timelapses: TaggedTimelapse[]
): Promise<void> {
  if (timelapses.length === 0) {
    return;
  }

  if (config.dryRun) {
    for (const item of timelapses) {
      const keys = objectKeys(config.r2.prefix, item);
      console.log(`[dry-run] Would upload ${item.stagedPath} -> ${keys.videoKey}`);
      console.log(`[dry-run] Would upload ${item.metadataPath} -> ${keys.metadataKey}`);
    }
    return;
  }

  const client = buildClient(config);

  for (const item of timelapses) {
    const keys = objectKeys(config.r2.prefix, item);

    await client.send(
      new PutObjectCommand({
        Bucket: config.r2.bucket,
        Key: keys.videoKey,
        Body: fs.createReadStream(item.stagedPath),
        ContentType: "video/mp4"
      })
    );

    await client.send(
      new PutObjectCommand({
        Bucket: config.r2.bucket,
        Key: keys.metadataKey,
        Body: fs.createReadStream(item.metadataPath),
        ContentType: "application/json"
      })
    );

    console.log(`Uploaded ${keys.videoKey} and metadata`);
  }
}
