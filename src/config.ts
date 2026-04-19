import { config as loadDotEnv } from "dotenv";
import path from "node:path";
import { z } from "zod";
import type { PrinterConfig } from "./types.js";

loadDotEnv();

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
    .transform((value) => value?.toLowerCase() === "true")
    .default("false")
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  const details = parsedEnv.error.issues
    .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
    .join("\n");
  throw new Error(`Invalid environment configuration:\n${details}`);
}

const env = parsedEnv.data;

const printerIds = env.PRINTERS.split(",")
  .map((v) => v.trim())
  .filter(Boolean);

const printerConfigs: PrinterConfig[] = printerIds.map((id) => {
  const host = process.env[`PRINTER_${id}_HOST`];
  const accessCode = process.env[`PRINTER_${id}_ACCESS_CODE`];
  const serial = process.env[`PRINTER_${id}_SERIAL`];
  if (!host || !accessCode || !serial) {
    throw new Error(
      `Missing config for printer ${id}: need PRINTER_${id}_HOST, PRINTER_${id}_ACCESS_CODE, PRINTER_${id}_SERIAL`
    );
  }
  return { id, host, accessCode, serial };
});

export const appConfig = {
  printers: printerConfigs,
  workDir: path.resolve(env.WORK_DIR),
  timelapseExtension: env.TIMELAPSE_EXTENSION,
  r2: {
    accountId: env.R2_ACCOUNT_ID,
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    bucket: env.R2_BUCKET,
    prefix: env.R2_PREFIX
  },
  dryRun: env.DRY_RUN
};

export type AppConfig = typeof appConfig;
