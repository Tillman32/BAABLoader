import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";

// Test the env schema logic in isolation (without importing appConfig which
// calls safeParse at module load time against the real process.env).
const envSchema = z.object({
  PRINTERS: z.string().min(1),
  TIMELAPSE_SOURCE_ROOT: z.string().optional().default(""),
  WORK_DIR: z.string().default("./data"),
  TIMELAPSE_EXTENSION: z.string().default(".mp4"),
  R2_ACCOUNT_ID: z.string().min(1),
  R2_ACCESS_KEY_ID: z.string().min(1),
  R2_SECRET_ACCESS_KEY: z.string().min(1),
  R2_BUCKET: z.string().min(1),
  R2_PREFIX: z.string().default("timelapses"),
  DRY_RUN: z
    .string()
    .optional()
    .transform((v) => v?.toLowerCase() === "true")
    .default("false")
});

const validBase = {
  PRINTERS: "p1,p2",
  R2_ACCOUNT_ID: "acct123",
  R2_ACCESS_KEY_ID: "key123",
  R2_SECRET_ACCESS_KEY: "secret123",
  R2_BUCKET: "my-bucket"
};

describe("env schema", () => {
  test("parses valid env successfully", () => {
    const result = envSchema.safeParse(validBase);
    assert.ok(result.success);
    if (!result.success) return;
    assert.equal(result.data.PRINTERS, "p1,p2");
    assert.equal(result.data.WORK_DIR, "./data");
    assert.equal(result.data.TIMELAPSE_EXTENSION, ".mp4");
    assert.equal(result.data.R2_PREFIX, "timelapses");
    assert.equal(result.data.DRY_RUN, false);
  });

  test("fails when required field is missing", () => {
    const { R2_BUCKET: _, ...withoutBucket } = validBase;
    const result = envSchema.safeParse(withoutBucket);
    assert.ok(!result.success);
    if (result.success) return;
    const paths = result.error.issues.map((i) => i.path.join("."));
    assert.ok(paths.includes("R2_BUCKET"));
  });

  test("PRINTERS comma parsing with spaces is caller responsibility", () => {
    const result = envSchema.safeParse({ ...validBase, PRINTERS: " p1 , p2 , p3 " });
    assert.ok(result.success);
    if (!result.success) return;
    // The schema stores raw string; config.ts does the split+trim
    const printers = result.data.PRINTERS.split(",").map((v) => v.trim()).filter(Boolean);
    assert.deepEqual(printers, ["p1", "p2", "p3"]);
  });

  test("DRY_RUN=true → true", () => {
    const result = envSchema.safeParse({ ...validBase, DRY_RUN: "true" });
    assert.ok(result.success);
    if (!result.success) return;
    assert.equal(result.data.DRY_RUN, true);
  });

  test("DRY_RUN=TRUE → true (case-insensitive)", () => {
    const result = envSchema.safeParse({ ...validBase, DRY_RUN: "TRUE" });
    assert.ok(result.success);
    if (!result.success) return;
    assert.equal(result.data.DRY_RUN, true);
  });

  test("DRY_RUN=false → false", () => {
    const result = envSchema.safeParse({ ...validBase, DRY_RUN: "false" });
    assert.ok(result.success);
    if (!result.success) return;
    assert.equal(result.data.DRY_RUN, false);
  });

  test("DRY_RUN omitted → false", () => {
    const result = envSchema.safeParse(validBase);
    assert.ok(result.success);
    if (!result.success) return;
    assert.equal(result.data.DRY_RUN, false);
  });
});
