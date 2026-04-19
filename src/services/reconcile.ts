import fs from "node:fs/promises";
import path from "node:path";
import { Client } from "basic-ftp";
import type { AppConfig } from "../config.js";
import type { PulledTimelapse } from "../types.js";

const HASH_REGEX = /^([a-zA-Z0-9]{4,8})/;

export async function reconcile(
  config: AppConfig,
  isInR2: (hash: string) => Promise<boolean>
): Promise<PulledTimelapse[]> {
  console.log(
    `[reconcile] Starting startup backfill for ${config.printers.length} printer(s)`
  );

  const results: PulledTimelapse[] = [];

  for (const printer of config.printers) {
    const ftp = new Client();

    try {
      console.log(
        `[reconcile] Connecting to printer ${printer.id} at ${printer.host}:990`
      );
      await ftp.access({
        host: printer.host,
        port: 990,
        user: "bblp",
        password: printer.accessCode,
        secure: true,
        secureOptions: { rejectUnauthorized: false }
      });
      console.log(`[reconcile] Connected to printer ${printer.id}`);

      const listing = await ftp.list("/timelapse/");
      const timelapsFiles = listing.filter(
        (f) => f.name.endsWith(config.timelapseExtension)
      );

      console.log(
        `[reconcile] Found ${timelapsFiles.length} ${config.timelapseExtension} file(s) on printer ${printer.id}`
      );

      for (const entry of timelapsFiles) {
        const fileName = entry.name;
        const match = HASH_REGEX.exec(fileName);

        if (!match) {
          console.log(
            `[reconcile] Skipping ${fileName} on printer ${printer.id}: no hash prefix`
          );
          continue;
        }

        const hash = match[1];

        if (await isInR2(hash)) {
          console.log(
            `[reconcile] ${fileName} (hash: ${hash}) already in R2, skipping`
          );
          continue;
        }

        console.log(
          `[reconcile] Found unsynced file ${fileName} on printer ${printer.id} (hash: ${hash})`
        );

        const localDir = path.join(config.workDir, printer.id);
        const localPath = path.join(localDir, fileName);

        await fs.mkdir(localDir, { recursive: true });

        console.log(
          `[reconcile] Downloading /timelapse/${fileName} from printer ${printer.id} -> ${localPath}`
        );
        await ftp.downloadTo(localPath, `/timelapse/${fileName}`);
        console.log(`[reconcile] Download complete: ${localPath}`);

        results.push({
          hash,
          projectName: fileName,
          printerId: printer.id,
          printerSerial: printer.serial,
          printerModel: "P1S",
          stagedPath: localPath,
          capturedAt: new Date().toISOString()
        });
      }
    } finally {
      ftp.close();
    }
  }

  console.log(
    `[reconcile] Reconcile complete. Found ${results.length} unsynced file(s)`
  );

  return results;
}
