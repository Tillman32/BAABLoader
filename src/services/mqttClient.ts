import mqtt from "mqtt";
import type { AppConfig } from "../config.js";
import type { PrinterConfig } from "../types.js";
import { extractHash } from "./hashExtractor.js";

export interface PrintCompleteEvent {
  printerId: string;
  printerSerial: string;
  hash: string;
  jobName: string;      // full original job name from MQTT
  printerModel: string; // e.g. "P1S"
}

/**
 * Shape of the relevant portion of a Bambu MQTT report payload.
 * Only the fields BAABLoader cares about are typed; the rest are unknown.
 */
interface BambuPrintPayload {
  print?: {
    gcode_state?: string;
    subtask_name?: string;
    dev_id?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

function connectPrinter(
  printer: PrinterConfig,
  onPrintComplete: (event: PrintCompleteEvent) => void
): void {
  const reportTopic = `device/${printer.serial}/report`;

  const client = mqtt.connect(`mqtts://${printer.host}:8883`, {
    username: "bblp",
    password: printer.accessCode,
    rejectUnauthorized: false,
    reconnectPeriod: 5000
  });

  client.on("connect", () => {
    console.log(`[mqttClient] Connected to printer ${printer.id} (${printer.host})`);

    client.subscribe(reportTopic, (err) => {
      if (err) {
        console.error(
          `[mqttClient] Failed to subscribe to ${reportTopic} for printer ${printer.id}: ${err.message}`
        );
      }
    });
  });

  client.on("disconnect", () => {
    console.log(
      `[mqttClient] Printer ${printer.id} disconnected, reconnecting...`
    );
  });

  client.on("error", (err) => {
    console.error(`[mqttClient] Printer ${printer.id} error: ${err.message}`);
  });

  client.on("message", (_topic: string, raw: Buffer) => {
    let payload: BambuPrintPayload;
    try {
      payload = JSON.parse(raw.toString()) as BambuPrintPayload;
    } catch {
      // Non-JSON messages on this topic are not expected; silently ignore.
      return;
    }

    if (payload.print?.gcode_state !== "FINISH") {
      return;
    }

    const jobName = payload.print.subtask_name ?? "";

    const hash = extractHash(jobName);
    if (hash === null) {
      console.warn(
        `[mqttClient] Skipping job "${jobName}" on printer ${printer.id}: no valid hash prefix`
      );
      return;
    }

    onPrintComplete({
      printerId: printer.id,
      printerSerial: printer.serial,
      hash,
      jobName,
      printerModel: "P1S"
    });
  });
}

/**
 * Creates one MQTT client per printer in config.printers and begins
 * listening for print-complete events. Reconnection is handled automatically
 * by the mqtt library (reconnectPeriod: 5000ms).
 *
 * Calls onPrintComplete for each FINISH event whose job name contains a
 * valid hash prefix. Jobs without a valid hash are logged and skipped.
 */
export function startMqttListeners(
  config: AppConfig,
  onPrintComplete: (event: PrintCompleteEvent) => void
): void {
  for (const printer of config.printers) {
    connectPrinter(printer, onPrintComplete);
  }
}
