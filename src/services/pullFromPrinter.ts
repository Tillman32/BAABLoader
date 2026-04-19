import fs from "node:fs/promises";
import path from "node:path";
import { Client } from "basic-ftp";
import type { AppConfig } from "../config.js";
import type { PrinterConfig, PulledTimelapse } from "../types.js";

const INITIAL_DELAY_MS = 30_000;
const POLL_INTERVAL_MS = 10_000;

export async function pullFromPrinter(
  config: AppConfig,
  printer: PrinterConfig,
  hash: string,
  projectName: string
): Promise<PulledTimelapse> {
  const ftp = new Client();

  try {
    console.log(`[pullFromPrinter] Connecting to ${printer.id} at ${printer.host}:990`);
    await ftp.access({
      host: printer.host,
      port: 990,
      user: "bblp",
      password: printer.accessCode,
      secure: true,
      secureOptions: { rejectUnauthorized: false }
    });

    console.log(`[pullFromPrinter] Waiting ${INITIAL_DELAY_MS / 1000}s for file to finish writing`);
    await new Promise((resolve) => setTimeout(resolve, INITIAL_DELAY_MS));

    let fileName: string | null = null;
    let previousSize: number | null = null;

    while (true) {
      const listing = await ftp.list("/timelapse/");
      const candidates = listing.filter(
        (f) => f.name.startsWith(hash) && f.name.endsWith(config.timelapseExtension)
      );

      if (candidates.length === 0) {
        console.warn(`[pullFromPrinter] No file matching hash "${hash}" on ${printer.id}, retrying...`);
        previousSize = null;
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
        continue;
      }

      const entry = candidates.sort(
        (a, b) => (b.modifiedAt?.getTime() ?? 0) - (a.modifiedAt?.getTime() ?? 0)
      )[0];
      const currentSize = entry.size ?? -1;

      console.log(
        `[pullFromPrinter] Poll: ${entry.name} on ${printer.id} — ${currentSize} bytes (prev: ${previousSize ?? "n/a"})`
      );

      if (previousSize !== null && currentSize === previousSize) {
        fileName = entry.name;
        console.log(`[pullFromPrinter] ${fileName} stable at ${currentSize} bytes, downloading`);
        break;
      }

      previousSize = currentSize;
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }

    const localDir = path.join(config.workDir, printer.id);
    const localPath = path.join(localDir, fileName!);
    await fs.mkdir(localDir, { recursive: true });

    await ftp.downloadTo(localPath, `/timelapse/${fileName!}`);
    console.log(`[pullFromPrinter] Download complete: ${localPath}`);

    return {
      hash,
      projectName,
      printerId: printer.id,
      printerSerial: printer.serial,
      printerModel: "P1S",
      stagedPath: localPath,
      capturedAt: new Date().toISOString()
    };
  } finally {
    ftp.close();
  }
}
