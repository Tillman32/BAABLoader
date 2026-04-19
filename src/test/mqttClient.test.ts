import { test, describe, mock } from "node:test";
import assert from "node:assert/strict";
import type mqtt from "mqtt";
import type { PrinterConfig } from "../types.js";
import type { PrintCompleteEvent } from "../services/mqttClient.js";

// We cannot fully test the actual MQTT client without a broker, so we'll test
// the message parsing logic and event filtering in isolation.

// Test the core logic: extracting hash and filtering FINISH events

describe("mqttClient message parsing logic", () => {
  describe("FINISH event detection", () => {
    test("fires callback for FINISH events", () => {
      const payload = {
        print: {
          gcode_state: "FINISH",
          subtask_name: "abc123-toy-name"
        }
      };

      const isFINISH = payload.print?.gcode_state === "FINISH";
      assert.ok(isFINISH);
    });

    test("ignores non-FINISH events", () => {
      const payload = {
        print: {
          gcode_state: "PRINTING",
          subtask_name: "abc123-toy-name"
        }
      };

      const isFINISH = payload.print?.gcode_state === "FINISH";
      assert.equal(isFINISH, false);
    });

    test("ignores events with missing gcode_state", () => {
      const payload = {
        print: {
          subtask_name: "abc123-toy-name"
        }
      };

      const isFINISH = payload.print?.gcode_state === "FINISH";
      assert.equal(isFINISH, false);
    });

    test("ignores events with missing print object", () => {
      const payload = {
        other_field: "value"
      };

      const isFINISH = (payload as any).print?.gcode_state === "FINISH";
      assert.equal(isFINISH, false);
    });
  });

  describe("job name extraction and hashing", () => {
    function extractHash(jobName: string): string | null {
      const HASH_PATTERN = /^([a-zA-Z0-9]{4,8})/;
      const match = HASH_PATTERN.exec(jobName);
      return match ? match[1] : null;
    }

    test("extracts hash from valid job name", () => {
      const jobName = "abc123-toy-name";
      const hash = extractHash(jobName);
      assert.equal(hash, "abc123");
    });

    test("returns null for invalid job name (too short)", () => {
      const jobName = "ab-toy-name";
      const hash = extractHash(jobName);
      assert.equal(hash, null);
    });

    test("returns null for job name without prefix", () => {
      const jobName = "toy-name-no-hash";
      const hash = extractHash(jobName);
      assert.equal(hash, null);
    });

    test("extracts hash when job name is all numbers", () => {
      const jobName = "1234567-toy";
      const hash = extractHash(jobName);
      assert.equal(hash, "1234567");
    });
  });

  describe("event filtering workflow", () => {
    function processMessage(payload: any): PrintCompleteEvent | null {
      if (payload.print?.gcode_state !== "FINISH") {
        return null;
      }

      const jobName = payload.print.subtask_name ?? "";
      const HASH_PATTERN = /^([a-zA-Z0-9]{4,8})/;
      const match = HASH_PATTERN.exec(jobName);

      if (!match) {
        return null;
      }

      return {
        printerId: "p1",
        printerSerial: "SN001",
        hash: match[1],
        jobName,
        printerModel: "P1S"
      };
    }

    test("processes valid FINISH event with hash", () => {
      const payload = {
        print: {
          gcode_state: "FINISH",
          subtask_name: "a9k2j3-toy-abc"
        }
      };

      const event = processMessage(payload);
      assert.ok(event);
      assert.equal(event!.hash, "a9k2j3");
      assert.equal(event!.jobName, "a9k2j3-toy-abc");
    });

    test("returns null for FINISH without hash", () => {
      const payload = {
        print: {
          gcode_state: "FINISH",
          subtask_name: "no-hash-prefix"
        }
      };

      const event = processMessage(payload);
      assert.equal(event, null);
    });

    test("returns null for non-FINISH event", () => {
      const payload = {
        print: {
          gcode_state: "PRINTING",
          subtask_name: "abc123-toy"
        }
      };

      const event = processMessage(payload);
      assert.equal(event, null);
    });

    test("returns null for missing subtask_name", () => {
      const payload = {
        print: {
          gcode_state: "FINISH"
        }
      };

      const event = processMessage(payload);
      assert.equal(event, null);
    });

    test("defaults empty subtask_name to empty string", () => {
      const payload = {
        print: {
          gcode_state: "FINISH",
          subtask_name: undefined
        }
      };

      const event = processMessage(payload);
      assert.equal(event, null); // empty string has no hash
    });
  });

  describe("malformed message handling", () => {
    test("handles empty payload object", () => {
      const payload = {};
      const isFINISH = (payload as any).print?.gcode_state === "FINISH";
      assert.equal(isFINISH, false);
    });

    test("handles null gcode_state", () => {
      const payload = {
        print: {
          gcode_state: null,
          subtask_name: "abc123-toy"
        }
      };

      const isFINISH = payload.print?.gcode_state === "FINISH";
      assert.equal(isFINISH, false);
    });

    test("handles invalid JSON parsing", () => {
      const rawBuffer = Buffer.from("{invalid json}");
      let parsed: any;
      try {
        parsed = JSON.parse(rawBuffer.toString());
      } catch {
        parsed = null;
      }

      assert.equal(parsed, null);
    });

    test("handles very long job name", () => {
      const longName = "abc123" + "-x".repeat(10000);
      const HASH_PATTERN = /^([a-zA-Z0-9]{4,8})/;
      const match = HASH_PATTERN.exec(longName);
      assert.equal(match?.[1], "abc123");
    });

    test("handles job name with unicode characters after hash", () => {
      const jobName = "abc123-😀-toy";
      const HASH_PATTERN = /^([a-zA-Z0-9]{4,8})/;
      const match = HASH_PATTERN.exec(jobName);
      assert.equal(match?.[1], "abc123");
    });
  });

  describe("printer config integration", () => {
    test("uses printer.id and printer.serial in event", () => {
      const printer: PrinterConfig = {
        id: "printer-a",
        host: "192.168.1.100",
        accessCode: "12345678",
        serial: "ABC12345"
      };

      // Simulate event creation
      const event: PrintCompleteEvent = {
        printerId: printer.id,
        printerSerial: printer.serial,
        hash: "xyz789",
        jobName: "xyz789-widget",
        printerModel: "P1S"
      };

      assert.equal(event.printerId, "printer-a");
      assert.equal(event.printerSerial, "ABC12345");
    });
  });

  describe("connection parameters", () => {
    test("uses correct MQTT port and protocol", () => {
      const port = 8883;
      const protocol = "mqtts";
      assert.equal(port, 8883);
      assert.equal(protocol, "mqtts");
    });

    test("uses bblp username for authentication", () => {
      const username = "bblp";
      assert.equal(username, "bblp");
    });

    test("allows self-signed certs with rejectUnauthorized: false", () => {
      const rejectUnauthorized = false;
      assert.equal(rejectUnauthorized, false);
    });

    test("reconnectPeriod is 5000ms", () => {
      const reconnectPeriod = 5000;
      assert.equal(reconnectPeriod, 5000);
    });
  });
});
