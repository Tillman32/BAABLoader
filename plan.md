# BAABLoader — Implementation Plan

## What We're Building

BAABLoader evolves from a filesystem-based sync script into a TypeScript daemon that:

1. Subscribes to MQTT on each Bambu Lab P1S printer (LAN, port 8883 TLS)
2. Listens for print-complete events
3. Extracts a short customer hash from the Bambu Studio project name (you prefix projects like `a9k2j3-toy-name`)
4. Waits for the timelapse file to finish writing, then downloads it via FTPS
5. Deduplicates against R2 (HeadObject check)
6. Uploads via multipart to `timelapses/{hash}/video.mp4` + `timelapses/{hash}/meta.json`
7. Cleans up local staged files after confirmed upload

R2 is the database. A static website reads R2 directly by hash. Customers get a physical tag on their toy with the hash code, scan the website to find their timelapse.

**Language: TypeScript. No switch to Python.** The `bambu-mcp` project (Node.js) proves it's doable with `mqtt` + `basic-ftp` packages. The Python ecosystem for Bambu Lab is wider but not so much wider that it justifies a mixed codebase.

---

## Architecture

```
Bambu P1S #1          Bambu P1S #2
    │                     │
    └──── MQTT :8883 (TLS) ────────┐
    └──── FTPS (printer files) ────┤
                                   │
                         ┌─────────▼──────────────┐
                         │   BAABLoader (daemon)   │
                         │                         │
                         │  [startup]              │
                         │  reconcile()            │
                         │  ← scan SD via FTPS    │
                         │  ← HeadObject per file │
                         │  ← upload any missing  │
                         │         │               │
                         │  [runtime]              │
                         │  onPrintComplete()      │
                         │  ← MQTT event           │
                         │         │               │
                         │  extractHash()          │
                         │  ← project name prefix  │
                         │  ← validate /^[a-z0-9]  │
                         │    {4,8}/i or alert      │
                         │         │               │
                         │  waitForFile()           │
                         │  ← 30s delay            │
                         │  ← poll FTP every 10s   │
                         │  ← stable size × 2 polls│
                         │         │               │
                         │  pullFromPrinter()       │
                         │  ← FTPS download        │
                         │  → workDir staging      │
                         │         │               │
                         │  HeadObject(R2)          │
                         │  ← dedup check          │
                         │         │               │
                         │  tagTimelapse()          │
                         │  ← hash, printerId      │
                         │  ← capturedAt, model    │
                         │  ← projectName          │
                         │         │               │
                         │  Upload(R2)              │
                         │  ← @aws-sdk/lib-storage  │
                         │  ← multipart            │
                         │         │               │
                         │  cleanup()               │
                         │  ← delete staged file   │
                         │  ← delete .json sidecar │
                         └─────────────────────────┘
                                   │
                    R2 Bucket: timelapses/
                      a9k2j3/
                        video.mp4
                        meta.json  ← { hash, printerId, capturedAt,
                                        printerModel, projectName }
                      b2k4m7/
                        video.mp4
                        meta.json
                                   │
                    Static Website
                      /lookup/{hash}
                      → fetch R2 timelapses/{hash}/meta.json
                      → stream R2 timelapses/{hash}/video.mp4
```

---

## What Already Exists (Reuse)

| File | Status | Notes |
|------|--------|-------|
| `src/config.ts` | Extend | Solid zod validation. Add MQTT host/port/accessCode fields per printer. |
| `src/services/tagTimelapses.ts` | Extend | Add `hash` field. Remove `sourcePath` from tags (local path is meaningless in R2). |
| `src/services/uploadToR2.ts` | Rewrite | Switch `PutObjectCommand` → `Upload` (multipart). Add `HeadObjectCommand` dedup. Fix ContentType derivation. |
| `@aws-sdk/lib-storage` | Already installed | In `package.json`, unused. Use it. |
| `src/services/discoverPrinters.ts` | Rewrite | Was a config passthrough. Becomes network-aware printer config with IP + credentials. |
| `src/services/downloadTimelapses.ts` | Replace | Replace with `pullFromPrinter.ts` (FTPS). |

---

## Implementation Workstreams

| Lane | Step | Modules | Depends on |
|------|------|---------|-----------|
| A | MQTT client + print-complete listener | `src/services/mqttClient.ts` (new) | Auth research (TODOS item 1) |
| A | Hash extraction + validation | `src/services/hashExtractor.ts` (new) | MQTT client |
| B | FTPS printer download + file readiness polling | `src/services/pullFromPrinter.ts` (new) | Auth research |
| B | Startup backfill / reconcile | `src/services/reconcile.ts` (new) | FTPS puller |
| C | R2 dedup + multipart upload + cleanup | `src/services/uploadToR2.ts` (modify) | — |
| C | Config extension (MQTT creds per printer) | `src/config.ts` (modify) | — |
| — | Wire into daemon loop | `src/index.ts` (rewrite) | Merge A + B + C |
| — | Tests: config + objectKeys | `src/test/*.test.ts` (new) | — |

**Execution:** Launch Lane A and B in parallel worktrees. Merge both. Then wire into `index.ts` and add tests.

---

## Key Decisions Locked

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Language | TypeScript | `bambu-mcp` proves Node.js viability. Type safety for MQTT JSON payloads is valuable. |
| Run model | Daemon (pm2 or launchd) | MQTT requires long-lived process. |
| Hash wiring | MQTT project name prefix | `a9k2j3-toy-name` → extract `a9k2j3`. |
| Dedup | HeadObject against R2 | No local state to manage. Source of truth is R2. |
| Database | R2 (no backend) | Static website reads `timelapses/{hash}/meta.json` directly. |
| Upload API | `@aws-sdk/lib-storage` Upload | Multipart, already installed, unused. |
| R2 access | Public bucket, security-through-obscurity | Acceptable at this scale. Cloudflare Worker + signed URLs is the upgrade path. |
| File readiness | 30s delay + poll for stable size | MQTT fires before timelapse is written. Poll every 10s, confirm stable × 2. |

---

## Code Quality Fixes (Do These First)

These are bugs in the existing code, fix before adding new features:

1. **Idempotency bug** (`downloadTimelapses.ts:47-57`) -- staged files are unconditionally added to the upload queue even if already staged. Fix: only add if not yet uploaded (HeadObject check).
2. **Multipart upload** (`uploadToR2.ts`) -- switch `PutObjectCommand` → `Upload` from `@aws-sdk/lib-storage`.
3. **ContentType hardcoded** (`uploadToR2.ts:61`) -- derive from `TIMELAPSE_EXTENSION` config value.
4. **`sourcePath` in tags** (`tagTimelapses.ts`) -- local filesystem path is meaningless in R2 metadata. Remove it.
5. **Mixed `node:fs` imports** (`uploadToR2.ts`) -- drop sync `node:fs` once multipart upload is switched.

---

## Critical Gaps (Must Ship With Feature)

These are not nice-to-haves. Each one silently loses customer data if missing:

1. **MQTT reconnect loop** -- daemon must reconnect automatically on disconnect. Without it, a network blip stops all future uploads silently.
2. **Hash-missing validation** -- if project name doesn't match `/^[a-zA-Z0-9]{4,8}/`, log a warning with the printer ID and file name, skip upload. Don't silently drop or upload with a bad key.
3. **File readiness polling** -- 30s delay + stable-size polling after MQTT event before FTPS download.
4. **Startup backfill scan** -- on daemon start, scan each printer SD card via FTPS, HeadObject check each timelapse, upload any missing. Catches events missed while daemon was down.
5. **workDir cleanup** -- delete staged file + .json sidecar after confirmed R2 upload.

---

## NOT in Scope

- Multi-printer parallel downloads (sequential per-printer is fine at this scale)
- RTSP camera feed integration
- Print job management / gcode sending
- Cloudflare Workers / signed URL auth (upgrade path, not blocking)
- Automatic launchd / pm2 setup scripts
- Video remuxing for faststart (moov atom at end is a known limitation -- customers download rather than stream if it occurs)
- R2 lifecycle/expiry policies

---

## Known Risks

| Risk | Severity | Mitigation |
|------|----------|-----------|
| Jan 2025 Bambu firmware auth change | HIGH | Research before writing MQTT/FTPS code (see TODOS) |
| MQTT event fires before timelapse ready | HIGH | File readiness polling (in scope) |
| Daemon down = missed events | MEDIUM | Startup backfill scan (in scope) |
| Hash collision (reprint same toy) | LOW | Overwrite is acceptable at this scale; document convention |
| MP4 not faststart (can't stream) | LOW | Known limitation, document it |
| Local disk fill | LOW | workDir cleanup after upload (in scope) |

---

## Tests to Add

Config validation (`src/test/config.test.ts`):
- Valid env vars → parses correctly
- Missing required field → throws with message
- `PRINTERS` with spaces → trimmed correctly
- `DRY_RUN=true` / `DRY_RUN=TRUE` / `DRY_RUN=false` → correct boolean

R2 key construction (`src/test/r2.test.ts`):
- Normal hash + printer → expected path format
- Double slashes in prefix → normalized
- Hash at path root → no leading slash

---

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | — |
| Codex Review | `/codex review` | Independent 2nd opinion | 1 | issues_found | 10 findings incorporated |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | OPEN (PLAN) | 16 issues, 5 critical gaps |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | — |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | — |

**VERDICT:** ENG REVIEW ran — 5 critical gaps identified, all incorporated into plan. Outside voice (Codex) added 4 additional findings, all incorporated. Ready to implement once TODOS item 1 (Bambu auth research) is complete.
