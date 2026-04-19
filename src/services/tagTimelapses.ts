import fs from "node:fs/promises";
import path from "node:path";
import type { PulledTimelapse } from "../types.js";

export interface TaggedTimelapse extends PulledTimelapse {
  metadataPath: string;
}

export async function tagTimelapses(
  timelapses: PulledTimelapse[]
): Promise<TaggedTimelapse[]> {
  const tagged: TaggedTimelapse[] = [];

  for (const item of timelapses) {
    const meta = {
      hash: item.hash,
      printerId: item.printerId,
      capturedAt: item.capturedAt,
      printerModel: item.printerModel,
      projectName: item.projectName
    };

    const metadataPath = `${item.stagedPath}.json`;
    await fs.writeFile(metadataPath, JSON.stringify(meta, null, 2));

    tagged.push({ ...item, metadataPath });
  }

  return tagged;
}
