import fs from "node:fs/promises";
import path from "node:path";
import type { AppConfig } from "../config.js";
import type { Printer } from "./discoverPrinters.js";

export interface StagedTimelapse {
  printerId: string;
  sourcePath: string;
  stagedPath: string;
  capturedAt: string;
}

async function ensureDirectory(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

export async function downloadTimelapses(
  config: AppConfig,
  printers: Printer[]
): Promise<StagedTimelapse[]> {
  const staged: StagedTimelapse[] = [];
  await ensureDirectory(config.workDir);

  for (const printer of printers) {
    const printerSourceDir = path.join(config.timelapseSourceRoot, printer.id);
    const printerStageDir = path.join(config.workDir, printer.id);
    await ensureDirectory(printerStageDir);

    let entries;
    try {
      entries = await fs.readdir(printerSourceDir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (!entry.isFile()) {
        continue;
      }
      if (!entry.name.endsWith(config.timelapseExtension)) {
        continue;
      }

      const sourcePath = path.join(printerSourceDir, entry.name);
      const stagedPath = path.join(printerStageDir, entry.name);

      try {
        await fs.access(stagedPath);
      } catch {
        await fs.copyFile(sourcePath, stagedPath);
      }

      const stats = await fs.stat(sourcePath);
      staged.push({
        printerId: printer.id,
        sourcePath,
        stagedPath,
        capturedAt: stats.mtime.toISOString()
      });
    }
  }

  return staged;
}
