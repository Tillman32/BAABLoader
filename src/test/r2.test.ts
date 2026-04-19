import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { objectKeys } from "../services/uploadToR2.js";
import type { TaggedTimelapse } from "../services/tagTimelapses.js";

function makeTimelapse(overrides: Partial<TaggedTimelapse> = {}): TaggedTimelapse {
  return {
    hash: "abc123",
    printerId: "p1",
    printerSerial: "SN001",
    printerModel: "P1S",
    projectName: "abc123-toy",
    stagedPath: "/data/p1/abc123-toy.mp4",
    capturedAt: "2026-04-19T00:00:00.000Z",
    metadataPath: "/data/p1/abc123-toy.mp4.json",
    ...overrides
  };
}

describe("objectKeys", () => {
  test("video key uses hash as path prefix", () => {
    const item = makeTimelapse({ hash: "a9k2j3" });
    const keys = objectKeys("timelapses", item);
    assert.ok(keys.videoKey.startsWith("timelapses/a9k2j3/"), `Expected hash prefix, got: ${keys.videoKey}`);
  });

  test("meta key is always meta.json under hash", () => {
    const item = makeTimelapse({ hash: "a9k2j3" });
    const keys = objectKeys("timelapses", item);
    assert.equal(keys.metadataKey, "timelapses/a9k2j3/meta.json");
  });

  test("video key is named video.{ext} from stagedPath", () => {
    const item = makeTimelapse({ stagedPath: "/data/p1/abc123.mp4" });
    const keys = objectKeys("timelapses", item);
    assert.equal(keys.videoKey, "timelapses/abc123/video.mp4");
  });

  test("double slashes in prefix are normalized", () => {
    const item = makeTimelapse({ hash: "abc123" });
    const keys = objectKeys("timelapses/", item);
    assert.ok(!keys.videoKey.includes("//"), `Double slash found: ${keys.videoKey}`);
  });

  test("hash is the entire directory, not printerId", () => {
    const item = makeTimelapse({ hash: "xyz99", printerId: "printer-a" });
    const keys = objectKeys("timelapses", item);
    assert.ok(keys.videoKey.includes("/xyz99/"), `Hash missing from key: ${keys.videoKey}`);
    assert.ok(!keys.videoKey.includes("printer-a"), `printerId leaked into key: ${keys.videoKey}`);
  });
});
