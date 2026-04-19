# TODOS

## Research: Bambu Lab LAN authentication before building MQTT client
**What:** Before writing the MQTT client, research the exact auth flow required by Bambu Lab P1S firmware post-January 2025.
**Why:** Bambu pushed a firmware update in Jan 2025 that broke all third-party local LAN tools by requiring new authentication (LAN access code + X.509 certificate handling). Getting this wrong means the daemon silently fails to connect.
**Pros:** Avoids wasted implementation effort on auth assumptions that are already wrong.
**Cons:** 30-60 min research before any code is written.
**Context:** Start by reading the `schwarztim/bambu-mcp` source (Node.js, does MQTT + FTPS) and the `greghesp/ha-bambulab` Home Assistant integration (Python, very complete). Both have working auth implementations as of early 2025. Key things to pin: MQTT port (8883 TLS), cert handling (self-signed, skip verify vs pin), FTPS port and passive mode, access code location in printer settings UI.
**Depends on:** Nothing -- do this before any MQTT/FTPS code.

## Add R2 workdir cleanup after successful upload
**What:** Delete the staged local file (and its .json sidecar) after a confirmed successful R2 upload.
**Why:** Without cleanup, the workDir fills with every timelapse ever downloaded. On a Mac running as a daemon, this will eventually fill the disk.
**Pros:** Free disk space, simple to implement (fs.unlink after upload confirmation).
**Cons:** No local backup copy (acceptable if R2 is the durable store).
**Context:** Add to uploadToR2.ts or as a cleanup step in index.ts after each tagged timelapse is processed.
**Depends on:** Multipart upload switch (so we know the upload actually completed).

## Startup backfill scan
**What:** On daemon startup, scan each printer's SD card via FTPS and run HeadObject check for each timelapse file found. Upload any that aren't already in R2.
**Why:** If the daemon is down when a print completes, the MQTT event is missed entirely. Without a backfill scan, that timelapse is never uploaded.
**Pros:** Zero missed prints, even after crashes or restarts.
**Cons:** Startup is slower (FTP scan per printer). Acceptable.
**Context:** Implement as a reconcile() function called once at startup before subscribing to MQTT events.
**Depends on:** FTPS printer connectivity implementation.

---

## Code quality fixes (do before new features)

### Switch PutObjectCommand → Upload (multipart)
**What:** Replace `PutObjectCommand` in `uploadToR2.ts` with `Upload` from `@aws-sdk/lib-storage`.
**Why:** For 100MB+ video files, a single HTTP PUT has no retry on partial failure. Multipart handles network blips gracefully.
**Context:** `@aws-sdk/lib-storage` is already in `package.json` but unused. Drop the sync `node:fs` import once switched.
**Depends on:** Nothing.

### Fix ContentType derivation
**What:** Derive `ContentType` from `TIMELAPSE_EXTENSION` config value instead of hardcoding `"video/mp4"`.
**Why:** The extension is configurable but the content type is not -- they'll diverge.
**Context:** `uploadToR2.ts:61`. Map extension to MIME type (`.mp4` → `video/mp4`, `.avi` → `video/x-msvideo`, etc.).
**Depends on:** Nothing.

### Remove sourcePath from R2 metadata tags
**What:** Remove `sourcePath` from the tags object written to `meta.json` in `tagTimelapses.ts`.
**Why:** It's a local filesystem path (`/Users/brandon/data/...`) that is meaningless to anyone reading R2.
**Context:** Replace with just `hash`, `printerId`, `capturedAt`, `printerModel`, `projectName`.
**Depends on:** Hash field being added to tags.

### Fix idempotency bug in staging
**What:** In `downloadTimelapses.ts:47-57`, staged files are unconditionally pushed to the upload queue even if already staged.
**Why:** Every run re-uploads every file it finds staged. This is masked now but will be obvious once running frequently as a daemon.
**Context:** This file will be largely replaced by `pullFromPrinter.ts`, but fix this if doing any interim work.
**Depends on:** Nothing.

---

## Add tests: config validation + R2 key construction
**What:** Add `src/test/config.test.ts` and `src/test/r2.test.ts` using Node built-in test runner.
**Why:** This is now a customer-facing data pipeline. A bug in hash extraction or R2 key construction means a customer's timelapse gets the wrong key.
**Context:**
- `config.test.ts`: valid env, missing required field, PRINTERS comma parsing with spaces, DRY_RUN variants
- `r2.test.ts`: objectKeys() path format, double-slash normalization, hash as prefix
**Depends on:** Nothing. Pure functions, no mocking required.

---

## Consider: signed URL upgrade path (Cloudflare Worker)
**What:** A ~20-line Cloudflare Worker that validates a hash exists in R2 and returns a 5-minute signed URL instead of serving the video from a public bucket.
**Why:** Current public bucket + 6-char hash is security-through-obscurity. Anyone who guesses or enumerates hashes sees any customer's video.
**Pros:** No enumeration possible. Can add revocation later.
**Cons:** Adds a backend component (even if minimal).
**Context:** Not needed at current hobby scale. Upgrade when/if the product grows or content sensitivity increases. Cloudflare Workers are free-tier eligible.
**Depends on:** Nothing. Can be added without changing BAABLoader itself.
