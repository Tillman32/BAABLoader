import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { tagTimelapses } from "../services/tagTimelapses.js";
import type { PulledTimelapse } from "../types.js";

const TEST_DIR = "./test-tag-temp";

async function setupTestDir(): Promise<void> {
  await fs.mkdir(TEST_DIR, { recursive: true });
}

async function cleanupTestDir(): Promise<void> {
  try {
    await fs.rm(TEST_DIR, { recursive: true, force: true });
  } catch {
    // ignore cleanup errors
  }
}

describe("tagTimelapses", () => {
  before(setupTestDir);
  after(cleanupTestDir);

  test("tags single timelapse with valid metadata", async () => {
    const now = new Date().toISOString();
    const pulled: PulledTimelapse[] = [
      {
        hash: "abc123",
        printerId: "p1",
        printerSerial: "SN001",
        printerModel: "P1S",
        projectName: "abc123-toy",
        stagedPath: path.join(TEST_DIR, "test1.mp4"),
        capturedAt: now
      }
    ];

    // Create the staged file
    await fs.writeFile(pulled[0].stagedPath, Buffer.from([0, 1, 2, 3]));

    const tagged = await tagTimelapses(pulled);

    assert.equal(tagged.length, 1);
    assert.equal(tagged[0].hash, "abc123");
    assert.equal(tagged[0].printerId, "p1");
    assert.ok(tagged[0].metadataPath.endsWith("test1.mp4.json"));
  });

  test("writes metadata file with correct json structure", async () => {
    const now = new Date().toISOString();
    const pulled: PulledTimelapse[] = [
      {
        hash: "xyz789",
        printerId: "p2",
        printerSerial: "SN002",
        printerModel: "P1S",
        projectName: "xyz789-widget",
        stagedPath: path.join(TEST_DIR, "test2.mp4"),
        capturedAt: now
      }
    ];

    await fs.writeFile(pulled[0].stagedPath, Buffer.from([0, 1, 2, 3]));

    const tagged = await tagTimelapses(pulled);

    // Read the metadata file
    const metaContent = await fs.readFile(tagged[0].metadataPath, "utf-8");
    const meta = JSON.parse(metaContent);

    assert.equal(meta.hash, "xyz789");
    assert.equal(meta.printerId, "p2");
    assert.equal(meta.printerModel, "P1S");
    assert.equal(meta.projectName, "xyz789-widget");
    assert.equal(meta.capturedAt, now);
  });

  test("handles multiple timelapses", async () => {
    const timelapses: PulledTimelapse[] = [
      {
        hash: "hash1",
        printerId: "p1",
        printerSerial: "SN001",
        printerModel: "P1S",
        projectName: "hash1-item1",
        stagedPath: path.join(TEST_DIR, "multi1.mp4"),
        capturedAt: "2026-04-19T10:00:00Z"
      },
      {
        hash: "hash2",
        printerId: "p2",
        printerSerial: "SN002",
        printerModel: "P1S",
        projectName: "hash2-item2",
        stagedPath: path.join(TEST_DIR, "multi2.mp4"),
        capturedAt: "2026-04-19T11:00:00Z"
      },
      {
        hash: "hash3",
        printerId: "p1",
        printerSerial: "SN001",
        printerModel: "P1S",
        projectName: "hash3-item3",
        stagedPath: path.join(TEST_DIR, "multi3.mp4"),
        capturedAt: "2026-04-19T12:00:00Z"
      }
    ];

    for (const item of timelapses) {
      await fs.writeFile(item.stagedPath, Buffer.from([0, 1, 2, 3]));
    }

    const tagged = await tagTimelapses(timelapses);

    assert.equal(tagged.length, 3);
    assert.equal(tagged[0].hash, "hash1");
    assert.equal(tagged[1].hash, "hash2");
    assert.equal(tagged[2].hash, "hash3");

    // Verify all metadata files exist
    for (const item of tagged) {
      const metaContent = await fs.readFile(item.metadataPath, "utf-8");
      const meta = JSON.parse(metaContent);
      assert.ok(meta.hash);
      assert.ok(meta.printerId);
    }
  });

  test("preserves all input fields in tagged output", async () => {
    const now = "2026-04-19T15:30:45.123Z";
    const pulled: PulledTimelapse[] = [
      {
        hash: "keepme",
        printerId: "printer-a",
        printerSerial: "SERIAL123",
        printerModel: "P1S",
        projectName: "keepme-project-name",
        stagedPath: path.join(TEST_DIR, "preserve.mp4"),
        capturedAt: now
      }
    ];

    await fs.writeFile(pulled[0].stagedPath, Buffer.from([0, 1, 2, 3]));

    const tagged = await tagTimelapses(pulled);
    const item = tagged[0];

    assert.equal(item.hash, "keepme");
    assert.equal(item.printerId, "printer-a");
    assert.equal(item.printerSerial, "SERIAL123");
    assert.equal(item.printerModel, "P1S");
    assert.equal(item.projectName, "keepme-project-name");
    assert.equal(item.stagedPath, pulled[0].stagedPath);
    assert.equal(item.capturedAt, now);
  });

  test("handles empty timelapse array", async () => {
    const tagged = await tagTimelapses([]);
    assert.equal(tagged.length, 0);
    assert.deepEqual(tagged, []);
  });

  test("metadata file is formatted with indentation", async () => {
    const pulled: PulledTimelapse[] = [
      {
        hash: "format",
        printerId: "p1",
        printerSerial: "SN001",
        printerModel: "P1S",
        projectName: "format-test",
        stagedPath: path.join(TEST_DIR, "format.mp4"),
        capturedAt: "2026-04-19T00:00:00Z"
      }
    ];

    await fs.writeFile(pulled[0].stagedPath, Buffer.from([0, 1, 2, 3]));

    const tagged = await tagTimelapses(pulled);
    const metaContent = await fs.readFile(tagged[0].metadataPath, "utf-8");

    // Check that the content contains newlines and indentation (not minified)
    assert.ok(metaContent.includes("\n"), "Metadata should be formatted with newlines");
    assert.ok(metaContent.includes("  "), "Metadata should use indentation");
  });

  test("adds metadataPath field to output", async () => {
    const pulled: PulledTimelapse[] = [
      {
        hash: "metapath",
        printerId: "p1",
        printerSerial: "SN001",
        printerModel: "P1S",
        projectName: "metapath-test",
        stagedPath: path.join(TEST_DIR, "metapath.mp4"),
        capturedAt: "2026-04-19T00:00:00Z"
      }
    ];

    await fs.writeFile(pulled[0].stagedPath, Buffer.from([0, 1, 2, 3]));

    const tagged = await tagTimelapses(pulled);

    assert.ok(tagged[0].metadataPath);
    assert.equal(tagged[0].metadataPath, pulled[0].stagedPath + ".json");
  });

  test("does not include sourcePath or other internal fields in metadata", async () => {
    const pulled: PulledTimelapse[] = [
      {
        hash: "clean",
        printerId: "p1",
        printerSerial: "SN001",
        printerModel: "P1S",
        projectName: "clean-test",
        stagedPath: path.join(TEST_DIR, "clean.mp4"),
        capturedAt: "2026-04-19T00:00:00Z"
      }
    ];

    await fs.writeFile(pulled[0].stagedPath, Buffer.from([0, 1, 2, 3]));

    const tagged = await tagTimelapses(pulled);
    const metaContent = await fs.readFile(tagged[0].metadataPath, "utf-8");
    const meta = JSON.parse(metaContent);

    // Only these five fields should be present
    const keys = Object.keys(meta).sort();
    assert.deepEqual(keys, [
      "capturedAt",
      "hash",
      "printerId",
      "printerModel",
      "projectName"
    ]);
  });
});
