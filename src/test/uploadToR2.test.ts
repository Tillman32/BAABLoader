import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { objectKeys, contentTypeForExtension } from "../services/uploadToR2.js";
import type { TaggedTimelapse } from "../services/tagTimelapses.js";

// Helper to create test timelapses
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
    assert.ok(keys.videoKey.startsWith("timelapses/a9k2j3/"));
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

  test("video key preserves file extension from stagedPath", () => {
    const item = makeTimelapse({ stagedPath: "/data/p1/file.mov" });
    const keys = objectKeys("timelapses", item);
    assert.equal(keys.videoKey, "timelapses/abc123/video.mov");
  });

  test("video key handles multiple dots in filename", () => {
    const item = makeTimelapse({ stagedPath: "/data/p1/file.backup.mp4" });
    const keys = objectKeys("timelapses", item);
    assert.equal(keys.videoKey, "timelapses/abc123/video.mp4");
  });

  test("double slashes in prefix are normalized", () => {
    const item = makeTimelapse({ hash: "abc123" });
    const keys = objectKeys("timelapses/", item);
    assert.ok(!keys.videoKey.includes("//"));
  });

  test("double slashes at prefix boundary are normalized", () => {
    const item = makeTimelapse({ hash: "abc123" });
    const keys = objectKeys("timelapses//", item);
    assert.ok(!keys.videoKey.includes("//"));
  });

  test("hash is the entire directory, not printerId", () => {
    const item = makeTimelapse({ hash: "xyz99", printerId: "printer-a" });
    const keys = objectKeys("timelapses", item);
    assert.ok(keys.videoKey.includes("/xyz99/"));
    assert.ok(!keys.videoKey.includes("printer-a"));
  });

  test("printerId does not leak into key", () => {
    const item = makeTimelapse({ printerId: "secret-printer-id" });
    const keys = objectKeys("r2", item);
    assert.ok(!keys.videoKey.includes("secret-printer-id"));
    assert.ok(!keys.metadataKey.includes("secret-printer-id"));
  });

  test("projectName does not appear in key", () => {
    const item = makeTimelapse({ projectName: "sensitive-project-data" });
    const keys = objectKeys("prefix", item);
    assert.ok(!keys.videoKey.includes("sensitive-project-data"));
    assert.ok(!keys.metadataKey.includes("sensitive-project-data"));
  });

  test("handles single-character hash", () => {
    // Note: 1-char hash is technically invalid but key construction shouldn't fail
    const item = makeTimelapse({ hash: "x" });
    const keys = objectKeys("timelapses", item);
    assert.equal(keys.videoKey, "timelapses/x/video.mp4");
    assert.equal(keys.metadataKey, "timelapses/x/meta.json");
  });

  test("handles long hash", () => {
    const longHash = "a".repeat(100);
    const item = makeTimelapse({ hash: longHash });
    const keys = objectKeys("timelapses", item);
    assert.ok(keys.videoKey.includes(longHash));
  });

  test("empty prefix is handled gracefully", () => {
    const item = makeTimelapse({ hash: "abc123" });
    const keys = objectKeys("", item);
    // Should still have the hash path
    assert.ok(keys.videoKey.includes("abc123"));
  });

  test("prefix with special characters is preserved", () => {
    const item = makeTimelapse({ hash: "abc123" });
    const keys = objectKeys("my-prefix-2026", item);
    assert.ok(keys.videoKey.startsWith("my-prefix-2026/abc123/"));
  });
});

describe("contentTypeForExtension", () => {
  test("maps .mp4 to video/mp4", () => {
    const type = contentTypeForExtension(".mp4");
    assert.equal(type, "video/mp4");
  });

  test("maps .mov to video/quicktime", () => {
    const type = contentTypeForExtension(".mov");
    assert.equal(type, "video/quicktime");
  });

  test("maps .avi to video/x-msvideo", () => {
    const type = contentTypeForExtension(".avi");
    assert.equal(type, "video/x-msvideo");
  });

  test("maps .mkv to video/x-matroska", () => {
    const type = contentTypeForExtension(".mkv");
    assert.equal(type, "video/x-matroska");
  });

  test("is case-insensitive (.MP4 -> video/mp4)", () => {
    const type = contentTypeForExtension(".MP4");
    assert.equal(type, "video/mp4");
  });

  test("is case-insensitive (.MOV -> video/quicktime)", () => {
    const type = contentTypeForExtension(".MOV");
    assert.equal(type, "video/quicktime");
  });

  test("mixed case is handled (.Mp4 -> video/mp4)", () => {
    const type = contentTypeForExtension(".Mp4");
    assert.equal(type, "video/mp4");
  });

  test("returns octet-stream for unknown extension", () => {
    const type = contentTypeForExtension(".xyz");
    assert.equal(type, "application/octet-stream");
  });

  test("returns octet-stream for missing extension", () => {
    const type = contentTypeForExtension("");
    assert.equal(type, "application/octet-stream");
  });

  test("returns octet-stream for null-like input", () => {
    const type = contentTypeForExtension(".unknown");
    assert.equal(type, "application/octet-stream");
  });

  test("handles extension without leading dot", () => {
    const type = contentTypeForExtension("mp4");
    // Without dot, it won't match, so should be octet-stream
    assert.equal(type, "application/octet-stream");
  });
});

describe("objectKeys - metadata path consistency", () => {
  test("metadata key always ends with meta.json", () => {
    const testCases = [
      { hash: "hash1", prefix: "timelapses" },
      { hash: "a9k2j3", prefix: "my-bucket" },
      { hash: "xyz", prefix: "" },
      { hash: "CAPS", prefix: "CAPS" }
    ];

    for (const tc of testCases) {
      const item = makeTimelapse({ hash: tc.hash });
      const keys = objectKeys(tc.prefix, item);
      assert.ok(keys.metadataKey.endsWith("/meta.json"), `Expected meta.json, got ${keys.metadataKey}`);
    }
  });

  test("metadata key directory matches video key directory", () => {
    const item = makeTimelapse({ hash: "test123", stagedPath: "/data/video.mp4" });
    const keys = objectKeys("prefix", item);
    const videoDir = keys.videoKey.substring(0, keys.videoKey.lastIndexOf("/"));
    const metaDir = keys.metadataKey.substring(0, keys.metadataKey.lastIndexOf("/"));
    assert.equal(videoDir, metaDir);
  });
});

describe("objectKeys - security considerations", () => {
  test("hash with path traversal attempt is used as-is (caller's responsibility)", () => {
    // The function doesn't sanitize; it's caller's job to validate hash regex
    const item = makeTimelapse({ hash: "../../../etc/passwd" });
    const keys = objectKeys("timelapses", item);
    // Key will contain the malicious hash as-is, showing responsibility is on caller
    assert.ok(keys.videoKey.includes("../../../etc/passwd"));
  });

  test("stagedPath extension extraction handles absolute paths safely", () => {
    const item = makeTimelapse({
      stagedPath: "/absolute/path/to/file.mp4"
    });
    const keys = objectKeys("prefix", item);
    // Should only extract .mp4, not the whole path
    assert.equal(keys.videoKey, "prefix/abc123/video.mp4");
  });

  test("stagedPath with no extension defaults gracefully", () => {
    const item = makeTimelapse({ stagedPath: "/data/file-no-ext" });
    const keys = objectKeys("prefix", item);
    // lastIndexOf(".") returns -1, so substring from -1 gives the whole string
    assert.ok(keys.videoKey.includes("video"));
  });
});
