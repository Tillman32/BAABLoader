# TODOS

## Research: Bambu Lab LAN authentication before building MQTT client
**What:** Before writing the MQTT client, research the exact auth flow required by Bambu Lab P1S firmware post-January 2025.
**Why:** Bambu pushed a firmware update in Jan 2025 that broke all third-party local LAN tools by requiring new authentication (LAN access code + X.509 certificate handling). Getting this wrong means the daemon silently fails to connect.
**Pros:** Avoids wasted implementation effort on auth assumptions that are already wrong.
**Cons:** 30-60 min research before any code is written.
**Context:** Start by reading the `schwarztim/bambu-mcp` source (Node.js, does MQTT + FTPS) and the `greghesp/ha-bambulab` Home Assistant integration (Python, very complete). Both have working auth implementations as of early 2025. Key things to pin: MQTT port (8883 TLS), cert handling (self-signed, skip verify vs pin), FTPS port and passive mode, access code location in printer settings UI.
**Depends on:** Nothing -- do this before any MQTT/FTPS code.
