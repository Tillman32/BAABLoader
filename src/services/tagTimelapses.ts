import fs from "node:fs/promises";
import path from "node:path";
import type { StagedTimelapse } from "./downloadTimelapses.js";

export interface TaggedTimelapse extends StagedTimelapse {
  tags: Record<string, string>;
  metadataPath: string;
}

export async function tagTimelapses(
  timelapses: StagedTimelapse[]
): Promise<TaggedTimelapse[]> {
  const tagged: TaggedTimelapse[] = [];

  for (const item of timelapses) {
    const tags: Record<string, string> = {
      printerId: item.printerId,
      capturedAt: item.capturedAt,
      sourcePath: item.sourcePath
    };

    const metadataPath = `${item.stagedPath}.json`;
    await fs.writeFile(
      metadataPath,
      JSON.stringify(
        {
          fileName: path.basename(item.stagedPath),
          tags
        },
        null,
        2
      )
    );

    tagged.push({
      ...item,
      tags,
      metadataPath
    });
  }

  return tagged;
}
