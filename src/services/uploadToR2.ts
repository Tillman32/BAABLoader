import fs from "node:fs/promises";
import { S3Client, HeadObjectCommand } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { createReadStream } from "node:fs";
import type { AppConfig } from "../config.js";
import type { TaggedTimelapse } from "./tagTimelapses.js";

const EXTENSION_CONTENT_TYPES: Record<string, string> = {
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".avi": "video/x-msvideo",
  ".mkv": "video/x-matroska"
};

export function contentTypeForExtension(ext: string): string {
  return EXTENSION_CONTENT_TYPES[ext.toLowerCase()] ?? "application/octet-stream";
}

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

export function objectKeys(
  prefix: string,
  item: TaggedTimelapse
): { videoKey: string; metadataKey: string } {
  const base = `${prefix}/${item.hash}`.replace(/\/+/g, "/");
  return {
    videoKey: `${base}/video${item.stagedPath.substring(item.stagedPath.lastIndexOf("."))}`,
    metadataKey: `${base}/meta.json`
  };
}

export async function objectExists(
  client: S3Client,
  bucket: string,
  key: string
): Promise<boolean> {
  try {
    await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch {
    return false;
  }
}

export async function uploadToR2(
  config: AppConfig,
  timelapses: TaggedTimelapse[]
): Promise<void> {
  if (timelapses.length === 0) return;

  if (config.dryRun) {
    for (const item of timelapses) {
      const keys = objectKeys(config.r2.prefix, item);
      console.log(`[dry-run] Would upload ${item.stagedPath} -> ${keys.videoKey}`);
      console.log(`[dry-run] Would upload ${item.metadataPath} -> ${keys.metadataKey}`);
    }
    return;
  }

  const client = buildClient(config);
  const videoContentType = contentTypeForExtension(config.timelapseExtension);

  for (const item of timelapses) {
    const keys = objectKeys(config.r2.prefix, item);

    if (await objectExists(client, config.r2.bucket, keys.videoKey)) {
      console.log(`Already in R2, skipping: ${keys.videoKey}`);
      continue;
    }

    await new Upload({
      client,
      params: {
        Bucket: config.r2.bucket,
        Key: keys.videoKey,
        Body: createReadStream(item.stagedPath),
        ContentType: videoContentType
      }
    }).done();

    const metaContent = await fs.readFile(item.metadataPath);
    await new Upload({
      client,
      params: {
        Bucket: config.r2.bucket,
        Key: keys.metadataKey,
        Body: metaContent,
        ContentType: "application/json"
      }
    }).done();

    console.log(`Uploaded ${keys.videoKey} and meta.json`);
  }
}

export function buildR2Client(config: AppConfig): S3Client {
  return buildClient(config);
}
