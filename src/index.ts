import { appConfig } from "./config.js";
import { discoverPrinters } from "./services/discoverPrinters.js";
import { downloadTimelapses } from "./services/downloadTimelapses.js";
import { tagTimelapses } from "./services/tagTimelapses.js";
import { uploadToR2 } from "./services/uploadToR2.js";

async function main(): Promise<void> {
  console.log("BAABLoader starting...");

  const printers = await discoverPrinters(appConfig);
  if (printers.length === 0) {
    console.log("No printers configured. Exiting.");
    return;
  }

  console.log(`Discovered ${printers.length} printer(s)`);

  const staged = await downloadTimelapses(appConfig, printers);
  console.log(`Staged ${staged.length} timelapse file(s)`);

  const tagged = await tagTimelapses(staged);
  console.log(`Tagged ${tagged.length} timelapse file(s)`);

  await uploadToR2(appConfig, tagged);
  console.log("BAABLoader completed.");
}

main().catch((error: unknown) => {
  console.error("BAABLoader failed:", error);
  process.exitCode = 1;
});
