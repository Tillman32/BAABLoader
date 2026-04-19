# Bambu Lab P1S LAN Auth — Research Findings

Researched 2026-04-19. Sources: `schwarztim/bambu-mcp`, `greghesp/ha-bambulab`, `Doridian/OpenBambuAPI`.

## What Changed in January 2025

The Jan 2025 firmware update added X.509 signing requirements for **command payloads** (things you publish to the printer). The connection itself -- port, TLS, username/password -- did not change.

BAABLoader only subscribes to printer events. It never publishes commands. The signing requirement does not apply.

## MQTT Connection

| Field | Value |
|---|---|
| Port | `8883` |
| Protocol | `mqtts` (TLS) |
| Username | `bblp` (hardcoded literal) |
| Password | 8-digit LAN access code from printer screen |
| `rejectUnauthorized` | `false` (Bambu uses their own CA, not a public CA) |
| Subscribe topic | `device/{SERIAL_NUMBER}/report` |
| Publish topic | `device/{SERIAL_NUMBER}/request` (not needed for BAABLoader) |
| Reconnect | Safe -- use `reconnectPeriod: 5000` |

```typescript
mqtt.connect({
  host: printerIp,
  port: 8883,
  protocol: "mqtts",
  username: "bblp",
  password: accessCode,
  rejectUnauthorized: false,
  reconnectPeriod: 5000,
});

client.on("connect", () => {
  client.subscribe(`device/${serialNumber}/report`);
});
```

## FTPS Connection

| Field | Value |
|---|---|
| Port | `990` |
| TLS mode | **Implicit TLS** -- the socket is wrapped in TLS before the FTP handshake |
| Username | `bblp` |
| Password | Same 8-digit access code |
| Passive mode | Yes (required) |
| `rejectUnauthorized` | `false` |
| Timelapse directory | `/timelapse` |

`basic-ftp` with `secure: true` handles implicit TLS correctly. This is not the same as STARTTLS (explicit TLS on port 21) -- most FTP libraries default to explicit. Must use `basic-ftp` or `curl --ftp-ssl-reqd`.

```typescript
import { Client as FTPClient } from "basic-ftp";

const ftp = new FTPClient();
await ftp.access({
  host: printerIp,
  port: 990,
  user: "bblp",
  password: accessCode,
  secure: true,                          // implicit TLS on 990
  secureOptions: { rejectUnauthorized: false },
});

const files = await ftp.list("/timelapse");
await ftp.downloadTo(localPath, `/timelapse/${filename}`);
ftp.close();
```

## Where Users Find Credentials

All three values are on the printer touchscreen:

| Value | Path on printer |
|---|---|
| Access code | Settings > LAN > Access Code (8-digit number) |
| Serial number | Settings > Device > Serial Number |
| IP address | Settings > LAN / WLAN > IP Address |

Serial number is also on a physical label on the printer (back or bottom).

## Single-Client Behavior

The printer delivers MQTT telemetry to only one local subscriber at a time ("last writer wins"). This is a firmware-level behavior, not a hard connection block -- multiple clients can connect, but only the most recently subscribed one gets data.

**This does not affect BAABLoader in practice.** When Bambu Studio is in cloud mode (the default), it connects to Bambu's cloud MQTT broker (`us.mqtt.bambulab.com`), not the local printer broker. BAABLoader connects to the local broker. They are on separate brokers and do not compete.

The conflict only arises if another tool (Home Assistant, OrcaSlicer in LAN mode, MQTT Explorer) also connects to the local broker simultaneously. If that's a concern, a Mosquitto bridge proxy (`disconn3ct/bambu-proxy`) solves it.

## X.509 Signing (Not Needed for BAABLoader)

Firmware 01.08.02.00 (June 2025) added signing requirements for control commands published to `device/{serial}/request`. The signing uses RSA-SHA256 with a cert extracted from the Bambu Connect application.

BAABLoader never publishes commands -- it only subscribes to `report`. Signing is not required.

If sending commands ever becomes necessary (e.g., requesting a full state push), use `pushing.pushall` which works without signing as a monitoring command.

## npm Packages

```json
"mqtt": "^5.x",
"basic-ftp": "^5.x"
```

Both are already used in `schwarztim/bambu-mcp` against real P1S printers. No additional auth libraries needed.
