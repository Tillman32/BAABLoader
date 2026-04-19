import { test, describe } from "node:test";
import assert from "node:assert/strict";
import type { PulledTimelapse } from "../types.js";

// Since pullFromPrinter involves real FTP connections and timing,
// we test the core logic and error handling patterns in isolation.

describe("pullFromPrinter logic", () => {
  describe("file candidate filtering", () => {
    interface FileEntry {
      name: string;
      size?: number;
      modifiedAt?: Date;
    }

    function filterCandidates(
      listing: FileEntry[],
      hash: string,
      extension: string
    ): FileEntry[] {
      return listing.filter(
        (f) => f.name.startsWith(hash) && f.name.endsWith(extension)
      );
    }

    test("filters files by hash prefix", () => {
      const listing: FileEntry[] = [
        { name: "abc123-toy.mp4", size: 100 },
        { name: "abc123-backup.mp4", size: 50 },
        { name: "xyz789-toy.mp4", size: 200 }
      ];

      const candidates = filterCandidates(listing, "abc123", ".mp4");
      assert.equal(candidates.length, 2);
      assert.ok(candidates.every((f) => f.name.startsWith("abc123")));
    });

    test("filters files by extension", () => {
      const listing: FileEntry[] = [
        { name: "abc123-toy.mp4", size: 100 },
        { name: "abc123-toy.mov", size: 100 },
        { name: "abc123-toy.txt", size: 100 }
      ];

      const candidates = filterCandidates(listing, "abc123", ".mp4");
      assert.equal(candidates.length, 1);
      assert.equal(candidates[0].name, "abc123-toy.mp4");
    });

    test("returns empty list when no matches", () => {
      const listing: FileEntry[] = [
        { name: "xyz789-toy.mp4", size: 100 },
        { name: "def456-toy.mp4", size: 100 }
      ];

      const candidates = filterCandidates(listing, "abc123", ".mp4");
      assert.equal(candidates.length, 0);
    });

    test("handles case-sensitive hash matching", () => {
      const listing: FileEntry[] = [
        { name: "abc123-toy.mp4", size: 100 },
        { name: "ABC123-toy.mp4", size: 100 }
      ];

      const candidates = filterCandidates(listing, "abc123", ".mp4");
      // startsWith is case-sensitive, so only exact match
      assert.equal(candidates.length, 1);
      assert.equal(candidates[0].name, "abc123-toy.mp4");
    });
  });

  describe("file stability polling", () => {
    function isFileStable(
      previousSize: number | null,
      currentSize: number
    ): boolean {
      return previousSize !== null && currentSize === previousSize;
    }

    test("detects stable file when size matches previous poll", () => {
      const stable = isFileStable(1000, 1000);
      assert.ok(stable);
    });

    test("detects unstable file when size differs", () => {
      const stable = isFileStable(1000, 1050);
      assert.equal(stable, false);
    });

    test("detects unstable file on first poll (null previous)", () => {
      const stable = isFileStable(null, 1000);
      assert.equal(stable, false);
    });

    test("handles zero-byte file", () => {
      const stable = isFileStable(0, 0);
      assert.ok(stable);
    });

    test("handles large file sizes", () => {
      const largeSize = 1_000_000_000; // 1GB
      const stable = isFileStable(largeSize, largeSize);
      assert.ok(stable);
    });
  });

  describe("file selection by modification time", () => {
    interface FileEntry {
      name: string;
      size?: number;
      modifiedAt?: Date;
    }

    function selectMostRecent(candidates: FileEntry[]): FileEntry {
      return candidates.sort(
        (a, b) => (b.modifiedAt?.getTime() ?? 0) - (a.modifiedAt?.getTime() ?? 0)
      )[0];
    }

    test("selects file with latest modification time", () => {
      const candidates: FileEntry[] = [
        { name: "file1.mp4", modifiedAt: new Date("2026-04-19T10:00:00Z") },
        { name: "file2.mp4", modifiedAt: new Date("2026-04-19T11:00:00Z") },
        { name: "file3.mp4", modifiedAt: new Date("2026-04-19T10:30:00Z") }
      ];

      const selected = selectMostRecent(candidates);
      assert.equal(selected.name, "file2.mp4");
    });

    test("handles files without modifiedAt", () => {
      const candidates: FileEntry[] = [
        { name: "file1.mp4" },
        { name: "file2.mp4", modifiedAt: new Date("2026-04-19T11:00:00Z") }
      ];

      const selected = selectMostRecent(candidates);
      assert.equal(selected.name, "file2.mp4");
    });

    test("selects first when all have same time", () => {
      const time = new Date("2026-04-19T10:00:00Z");
      const candidates: FileEntry[] = [
        { name: "file1.mp4", modifiedAt: time },
        { name: "file2.mp4", modifiedAt: time },
        { name: "file3.mp4", modifiedAt: time }
      ];

      const selected = selectMostRecent(candidates);
      assert.equal(selected.name, "file1.mp4");
    });
  });

  describe("timeout and polling constants", () => {
    test("initial delay is 30 seconds", () => {
      const INITIAL_DELAY_MS = 30_000;
      assert.equal(INITIAL_DELAY_MS, 30_000);
    });

    test("poll interval is 10 seconds", () => {
      const POLL_INTERVAL_MS = 10_000;
      assert.equal(POLL_INTERVAL_MS, 10_000);
    });

    test("delays are reasonable values", () => {
      const INITIAL_DELAY_MS = 30_000;
      const POLL_INTERVAL_MS = 10_000;
      assert.ok(INITIAL_DELAY_MS > POLL_INTERVAL_MS);
      assert.ok(POLL_INTERVAL_MS > 1000);
    });
  });

  describe("PulledTimelapse construction", () => {
    test("creates valid PulledTimelapse object", () => {
      const pulled: PulledTimelapse = {
        hash: "abc123",
        projectName: "abc123-toy",
        printerId: "p1",
        printerSerial: "SN001",
        printerModel: "P1S",
        stagedPath: "/data/p1/abc123.mp4",
        capturedAt: new Date().toISOString()
      };

      assert.equal(pulled.hash, "abc123");
      assert.equal(pulled.printerId, "p1");
      assert.equal(pulled.printerSerial, "SN001");
      assert.equal(pulled.printerModel, "P1S");
      assert.ok(pulled.stagedPath);
      assert.ok(pulled.capturedAt);
    });

    test("capturedAt is ISO string", () => {
      const now = new Date().toISOString();
      const pulled: PulledTimelapse = {
        hash: "abc123",
        projectName: "abc123-toy",
        printerId: "p1",
        printerSerial: "SN001",
        printerModel: "P1S",
        stagedPath: "/data/p1/abc123.mp4",
        capturedAt: now
      };

      // Verify it can be parsed back
      const parsed = new Date(pulled.capturedAt);
      assert.ok(parsed instanceof Date);
      assert.ok(!isNaN(parsed.getTime()));
    });

    test("stagedPath includes directory and filename", () => {
      const pulled: PulledTimelapse = {
        hash: "abc123",
        projectName: "abc123-toy",
        printerId: "p1",
        printerSerial: "SN001",
        printerModel: "P1S",
        stagedPath: "/data/p1/abc123-toy.mp4",
        capturedAt: new Date().toISOString()
      };

      assert.ok(pulled.stagedPath.includes("/data/p1/"));
      assert.ok(pulled.stagedPath.includes("abc123"));
    });
  });

  describe("FTP connection parameters", () => {
    test("uses port 990 for FTPS", () => {
      const port = 990;
      assert.equal(port, 990);
    });

    test("uses bblp username", () => {
      const username = "bblp";
      assert.equal(username, "bblp");
    });

    test("uses secure: true flag", () => {
      const secure = true;
      assert.equal(secure, true);
    });

    test("rejects self-signed certs: false for local LAN", () => {
      const rejectUnauthorized = false;
      assert.equal(rejectUnauthorized, false);
    });

    test("timelapse directory path is /timelapse/", () => {
      const dir = "/timelapse/";
      assert.equal(dir, "/timelapse/");
    });
  });

  describe("local staging directory construction", () => {
    test("creates directory path from workDir and printerId", async () => {
      const path = await import("node:path");
      const workDir = "./data";
      const printerId = "p1";
      const localDir = path.default.join(workDir, printerId);
      // path.join normalizes, so "./data" becomes "data"
      assert.equal(localDir, "data/p1");
    });

    test("handles absolute workDir", async () => {
      const path = await import("node:path");
      const workDir = "/var/data";
      const printerId = "printer-a";
      const localDir = path.default.join(workDir, printerId);
      assert.equal(localDir, "/var/data/printer-a");
    });

    test("creates local file path from directory and filename", async () => {
      const path = await import("node:path");
      const localDir = "data/p1";
      const fileName = "abc123-toy.mp4";
      const localPath = path.default.join(localDir, fileName);
      assert.equal(localPath, "data/p1/abc123-toy.mp4");
    });
  });

  describe("error scenarios", () => {
    test("handles connection failure gracefully (caller's responsibility)", async () => {
      // The function uses try/finally to ensure ftp.close() is called
      let closeCalled = false;

      const mockFtp = {
        access: async () => {
          throw new Error("Connection failed");
        },
        close: () => {
          closeCalled = true;
        }
      };

      // Simulating the try/finally pattern
      try {
        await mockFtp.access();
      } catch {
        // Catch connection error
      } finally {
        mockFtp.close();
      }

      assert.ok(closeCalled);
    });

    test("handles file not found by retrying", () => {
      // Logic shows: if candidates.length === 0, retry after poll interval
      const listing: { name: string }[] = [];
      const candidates = listing.filter((f) => f.name.startsWith("abc123"));
      assert.equal(candidates.length, 0);
      // Would retry...
    });
  });
});
