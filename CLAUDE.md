# BAABLoader — Claude Code Context

## What This Is

BAABLoader is a TypeScript daemon that pulls timelapses off Bambu Lab P1S printers and uploads them to Cloudflare R2. Each timelapse is keyed by a short customer hash (e.g. `a9k2j3`) that matches a physical tag on the printed toy. Customers look up their timelapse on a static website by entering the hash.

See `plan.md` for full architecture, decisions, and implementation workstreams.
See `TODOS.md` for deferred work and pre-implementation research tasks.

## Stack

- **Runtime:** Node.js 20+ with TypeScript (`tsx` for dev, `tsc` for build)
- **Printer connectivity:** MQTT (port 8883 TLS) + FTPS for file download
- **Storage:** Cloudflare R2 via `@aws-sdk/client-s3` + `@aws-sdk/lib-storage`
- **Config:** `dotenv` + `zod` schema validation in `src/config.ts`

## Commands

```bash
npm run dev        # run with tsx (no build step)
npm run build      # tsc compile to dist/
npm run start      # run compiled output
npm run check      # type check only, no emit
npm test           # run unit tests
```

## Pre-Push Checklist (main branch)

Before pushing to main:
1. **Increment version in `package.json`** — compare against the latest git tag/release on main. Use semver: patch for bug fixes, minor for features, major for breaking changes.
2. Run `npm run check` — no type errors
3. Run `npm test` — all tests pass
4. Commit version bump separately (e.g., "chore: bump to v1.2.3") before pushing

The GitHub Actions workflow will auto-tag and release based on the `version` field in `package.json`.

## Testing

No test framework configured yet. Plan calls for Node built-in test runner (`node:test`).
Tests go in `src/test/`. Run with: `node --test src/test/**/*.test.ts` (or via tsx).

Priority test files to add:
- `src/test/config.test.ts` -- zod env validation
- `src/test/r2.test.ts` -- objectKeys() path construction

## Project Structure

```
src/
  index.ts                   ← entry point (will become daemon loop)
  config.ts                  ← zod env schema, single source of config truth
  services/
    discoverPrinters.ts      ← currently a passthrough; will become MQTT-aware
    downloadTimelapses.ts    ← will be replaced by pullFromPrinter.ts
    tagTimelapses.ts         ← tags files with metadata; extend with hash field
    uploadToR2.ts            ← uploads to R2; needs multipart + dedup switch
```

New files to add (see plan.md):
- `src/services/mqttClient.ts` -- MQTT subscription per printer
- `src/services/hashExtractor.ts` -- extract + validate hash from project name
- `src/services/pullFromPrinter.ts` -- FTPS download with file readiness polling
- `src/services/reconcile.ts` -- startup backfill scan

## R2 Object Layout

```
timelapses/
  {hash}/
    video.mp4
    meta.json    ← { hash, printerId, capturedAt, printerModel, projectName }
```

The hash is the primary key. No other database exists.

## Hash Convention

Before starting a print, name the Bambu Studio project with the hash as a prefix:

```
a9k2j3-toy-name-here
```

BAABLoader extracts the hash with `/^([a-zA-Z0-9]{4,8})/` from the MQTT job name field. Projects that don't match this pattern are skipped with a warning.

## Critical Rules

- **Do not deploy MQTT/FTPS code before completing TODOS item 1 (auth research).** The Jan 2025 Bambu firmware update changed the auth requirements. Getting this wrong means the daemon silently fails to connect.
- **Never remove workDir cleanup** -- staged files must be deleted after confirmed R2 upload or local disk fills up.
- **Never remove the MQTT reconnect loop** -- a network blip without reconnect silently stops all future uploads.
- **Hash validation is required** -- reject project names that don't match the hash regex with a logged warning, never silently drop or upload with a bad key.

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PRINTERS` | yes | — | Comma-separated printer IDs (for tagging; will add IP/host) |
| `TIMELAPSE_SOURCE_ROOT` | yes (legacy) | — | Local dir fallback; will be replaced by FTPS |
| `WORK_DIR` | no | `./data` | Local staging directory |
| `TIMELAPSE_EXTENSION` | no | `.mp4` | File extension filter |
| `R2_ACCOUNT_ID` | yes | — | Cloudflare account ID |
| `R2_ACCESS_KEY_ID` | yes | — | R2 access key |
| `R2_SECRET_ACCESS_KEY` | yes | — | R2 secret key |
| `R2_BUCKET` | yes | — | R2 bucket name |
| `R2_PREFIX` | no | `timelapses` | R2 key prefix |
| `DRY_RUN` | no | `false` | Skip actual uploads when true |

Printer-specific MQTT config (to be added): `PRINTER_{ID}_HOST`, `PRINTER_{ID}_ACCESS_CODE`, `PRINTER_{ID}_SERIAL`.

## Known Limitations

- MP4 files from Bambu Lab printers may not be "faststart" (moov atom at end). If so, the static website must download the full file before playback. An `ffmpeg -movflags faststart` remux step can fix this but is out of scope for now.
- R2 bucket is public. The hash provides security-through-obscurity. For a small operation this is acceptable; a Cloudflare Worker with signed URLs is the upgrade path.
