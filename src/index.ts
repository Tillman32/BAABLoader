import fs from "node:fs/promises";
import { appConfig } from "./config.js";
import { startMqttListeners, type PrintCompleteEvent } from "./services/mqttClient.js";
import { pullFromPrinter } from "./services/pullFromPrinter.js";
import { tagTimelapses, type TaggedTimelapse } from "./services/tagTimelapses.js";
import { uploadToR2, objectExists, buildR2Client } from "./services/uploadToR2.js";
import { reconcile } from "./services/reconcile.js";

async function cleanupStaged(timelapses: TaggedTimelapse[]): Promise<void> {
  for (const item of timelapses) {
    for (const filePath of [item.stagedPath, item.metadataPath]) {
      try {
        await fs.unlink(filePath);
      } catch {
        console.warn(`[daemon] Could not delete staged file: ${filePath}`);
      }
    }
  }
}

async function handlePrintComplete(event: PrintCompleteEvent): Promise<void> {
  const printer = appConfig.printers.find((p) => p.id === event.printerId);
  if (!printer) {
    console.error(`[daemon] Unknown printer ID: ${event.printerId}`);
    return;
  }

  console.log(`[daemon] Print complete on ${event.printerId}: hash="${event.hash}" job="${event.jobName}"`);

  try {
    const pulled = await pullFromPrinter(appConfig, printer, event.hash, event.jobName);
    const tagged = await tagTimelapses([pulled]);
    await uploadToR2(appConfig, tagged);
    await cleanupStaged(tagged);
  } catch (err) {
    console.error(`[daemon] Failed processing print "${event.hash}" on ${event.printerId}:`, err);
  }
}

async function main(): Promise<void> {
  console.log("BAABLoader daemon starting...");

  const r2Client = buildR2Client(appConfig);

  const isInR2 = async (hash: string): Promise<boolean> => {
    const key = `${appConfig.r2.prefix}/${hash}/video${appConfig.timelapseExtension}`.replace(/\/+/g, "/");
    return objectExists(r2Client, appConfig.r2.bucket, key);
  };

  const missed = await reconcile(appConfig, isInR2);
  if (missed.length > 0) {
    console.log(`[daemon] Uploading ${missed.length} backfilled timelapse(s)`);
    const tagged = await tagTimelapses(missed);
    await uploadToR2(appConfig, tagged);
    await cleanupStaged(tagged);
  }

  startMqttListeners(appConfig, (event) => {
    handlePrintComplete(event).catch((err: unknown) => {
      console.error("[daemon] Unhandled error in print handler:", err);
    });
  });

  console.log(`BAABLoader daemon running, watching ${appConfig.printers.length} printer(s).`);
}

main().catch((err: unknown) => {
  console.error("BAABLoader failed:", err);
  process.exitCode = 1;
});
