# BAABLoader

BAABLoader is a small TypeScript utility service that:

1. Reads timelapses from local directories (one folder per Bambu Lab P1S printer)
2. Tags each file with printer and capture metadata
3. Uploads video + metadata sidecar JSON to Cloudflare R2

## Requirements

- Node.js 20+
- npm
- A local directory containing timelapse files by printer ID
- Cloudflare R2 bucket and API credentials

## Setup

```bash
npm install
cp .env.example .env
```

Update `.env` values for your environment.

## Run

```bash
npm run dev
```

## Build and start

```bash
npm run build
npm run start
```

## Folder convention

`TIMELAPSE_SOURCE_ROOT` should look like:

```text
/path/to/timelapses/
  p1s-garage/
    print-a.mp4
    print-b.mp4
  p1s-office/
    print-c.mp4
```

The `PRINTERS` environment variable should include those folder names.

## Dry run mode

Set `DRY_RUN=true` to verify discovery/staging/tagging without uploading files.
