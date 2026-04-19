import { config as loadDotEnv } from "dotenv";
import path from "node:path";
import { z } from "zod";

loadDotEnv();

const envSchema = z.object({
  PRINTERS: z.string().min(1),
  TIMELAPSE_SOURCE_ROOT: z.string().min(1),
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

export const appConfig = {
  printers: env.PRINTERS.split(",")
    .map((value) => value.trim())
    .filter(Boolean),
  timelapseSourceRoot: path.resolve(env.TIMELAPSE_SOURCE_ROOT),
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
