# TODOS

## DONE

### ~~Research: Bambu Lab LAN authentication~~ COMPLETE
Findings documented in `docs/bambu-lan-auth.md`. Short version:
- MQTT: port 8883, TLS, username `bblp`, password = 8-digit access code, `rejectUnauthorized: false`
- FTPS: port 990, implicit TLS, same credentials, `basic-ftp` with `secure: true`
- X.509 signing: not required -- BAABLoader is read-only (subscribe only, no commands)
- Single-client conflict: not a real problem -- Bambu Studio uses cloud MQTT, BAABLoader uses local MQTT, separate brokers

### ~~Lane A: MQTT Client~~ COMPLETE
- `src/services/mqttClient.ts` -- connects per printer, TLS port 8883, subscribes to `device/{serial}/report`, fires callback on FINISH events, auto-reconnects
- `src/services/hashExtractor.ts` -- pure function, extracts/validates hash prefix from job name

### ~~Lane B: FTPS Download + Startup Backfill~~ COMPLETE
- `src/services/pullFromPrinter.ts` -- finds file by hash on SD card, 30s delay + size-stability polling, FTPS download to workDir
- `src/services/reconcile.ts` -- startup backfill: lists each printer's /timelapse/, skips files already in R2, downloads and returns PulledTimelapse[]

### ~~Lane C: R2 Upload Fixes~~ COMPLETE
1. ~~Switch to multipart upload~~ -- using `Upload` from `@aws-sdk/lib-storage`
2. ~~Fix ContentType~~ -- derived from `timelapseExtension` via lookup table
3. ~~Remove `sourcePath` from tags~~ -- replaced with `hash`, `printerId`, `capturedAt`, `printerModel`, `projectName`
4. ~~Fix idempotency bug~~ -- `objectExists()` HeadObject check before upload in `uploadToR2.ts`
5. ~~Drop sync `node:fs` import~~ -- `uploadToR2.ts` uses `node:fs/promises` and `createReadStream` from `node:fs`

### ~~Wire Everything Together~~ COMPLETE
- `src/index.ts` rewritten as daemon loop
- Calls `reconcile()` at startup, then `startMqttListeners()`
- On print-complete: pull → tag → upload → cleanup staged files
- R2 object key layout fixed: `{prefix}/{hash}/video.mp4` + `meta.json`

### ~~Add Tests~~ COMPLETE
- `src/test/config.test.ts` -- zod env schema: valid env, missing field, PRINTERS comma parsing, DRY_RUN variants (12 tests, all pass)
- `src/test/r2.test.ts` -- objectKeys: path format, double-slash normalization, hash as prefix, no printerId leak

Run with: `node --test --import tsx/esm src/test/**/*.test.ts`

---

## Deferred (Not Blocking)

### Printer-Specific Config Validation at Startup
`config.ts` throws if `PRINTER_{ID}_HOST/ACCESS_CODE/SERIAL` are missing at load time. Add a `.env.example` so operators know what to set.

### Signed URL Upgrade Path (Cloudflare Worker)
Current: public R2 bucket, security-through-obscurity (6-char hash).
Upgrade: ~20-line Cloudflare Worker that validates a hash exists in R2 and returns a 5-minute signed URL. No enumeration possible. Not needed at current scale.

### printerModel from MQTT
Currently hardcoded `"P1S"`. The Bambu MQTT payload contains device info that could be parsed for model. Low priority.

### MP4 Faststart Remux
MP4 files from Bambu Lab may have the moov atom at the end (not "faststart"), requiring full download before playback. An `ffmpeg -movflags faststart` remux step would fix this. Out of scope for now.
