# piMarquee

Digital signage for a Raspberry Pi running **Raspberry Pi OS Lite (64-bit)**. The Pi drives an HDMI
display with a free-form layout of widgets, edited from a web admin UI on your phone or laptop:

- **RTSP camera feeds** (IP cameras, via [go2rtc](https://github.com/AlexxIT/go2rtc) → WebRTC/MSE/MJPEG)
- **Embedded web pages** (dashboards, Grafana, Home Assistant, weather…)
- **Text blocks** and a **clock/date**
- **YouTube videos** played ad-free and without a login (downloaded once to the Pi with yt-dlp), optionally looping

Layouts are stored as percentages of the screen, so they scale to any display. Multiple named layouts
can be switched from the admin UI, the REST API, Home Assistant (MQTT) or a future Android app.

```
┌──────────── Raspberry Pi ─────────────────────────────────────────────┐
│  cage (Wayland kiosk) ─ Chromium --kiosk ─▶ http://127.0.0.1:8080/display   │
│                                   ▲ WebSocket (live layout updates)      │
│  piMarquee server (Node/Fastify) ┤ REST /api/v1  ─▶ admin UI, Android, HA│
│        │ manages streams          │ MQTT discovery ─▶ Home Assistant       │
│  go2rtc ◀── RTSP cameras          └ config.json (single file)             │
└───────────────────────────────────────────────────────────────────────┘
```

## Install on the Pi

1. Flash **Raspberry Pi OS Lite (64-bit)** (Bookworm or newer) with Raspberry Pi Imager. Set a user,
   enable SSH, configure Wi-Fi/Ethernet.
2. SSH in and run:

```bash
sudo apt-get install -y git
git clone https://github.com/Galactic-Technology-Group/piMarquee.git
cd piMarquee
sudo ./scripts/install.sh
```

The installer adds Chromium, cage, Node.js 22 and go2rtc; creates a `pimarquee` user; builds the app into
`/opt/pimarquee`; and enables three systemd units (`go2rtc`, `pimarquee`, `pimarquee-kiosk`).
Within a minute the HDMI output shows the default layout and the admin UI is at
`http://<pi-ip>:8080/`. To reach it by name, give the Pi the matching hostname
(`sudo hostnamectl set-hostname pimarquee`, or set it in Raspberry Pi Imager) and use
`http://pimarquee.local:8080/`.

- Update later: `sudo /opt/pimarquee/scripts/update.sh`
- Remove: `sudo /opt/pimarquee/scripts/uninstall.sh [--purge]`
- Logs: `journalctl -u pimarquee -f`, `journalctl -u pimarquee-kiosk -f`, `journalctl -u go2rtc -f`
- Config file: `/var/lib/pimarquee/config.json` (export/import from Settings)

Hardware quirks and things to verify on a real Pi are collected in
[docs/hardware-notes.md](docs/hardware-notes.md).

## Using it

- **Layouts** – create, duplicate, delete, and choose which one is shown. Open one to edit.
- **Editor** – add Camera / Web page / Text / Clock widgets, drag and resize them freely (snapping to
  edges and other widgets; hold Shift to disable), edit properties in the side panel. Changes save
  automatically and appear on the display within half a second if that layout is live.
  Shortcuts: arrows nudge, Shift+arrows nudge 1 %, Del, Ctrl+D duplicate, Ctrl+Z / Ctrl+Y, `[` `]` z-order.
- **Cameras** – add RTSP URLs. **Use the camera's sub-stream (≤720p, H.264).** "Test" probes the
  stream through go2rtc and warns about H.265, which browsers cannot play via WebRTC.
- **Stream limit** – the server detects the Pi model (`/proc/device-tree/model`, `/proc/cpuinfo`) and
  sets a default number of concurrent camera decodes: Pi 5 → 4, Pi 4 → 2 (1 GB model → 1),
  Pi 3 / Zero 2 W → 1. Override it in Settings. Camera widgets beyond the limit show a placeholder
  instead of silently overloading the CPU; widget *priority* decides which ones win.
- **Settings** – display name, canvas aspect for the editor, time zone/locale, stream mode, display
  power method, periodic auto-reload, MQTT/Home Assistant, admin password and API tokens, backup.

### Embedded web pages

Many sites send `X-Frame-Options` / CSP headers that forbid being shown in a frame. The widget's
"Proxy through server" option fetches the page through the Pi and strips those headers. It works for
simple dashboards (Grafana with `allow_embedding`, Home Assistant with `use_x_frame_options: false`,
static pages) but **not** for sites that need logins, cookies or load assets from other domains.

### YouTube videos

Add a **YouTube** widget and paste any video link. In the default **Download** mode the server
fetches the video once with [yt-dlp](https://github.com/yt-dlp/yt-dlp) (≤720p H.264 by default) into
`/var/lib/pimarquee/media/` and the display plays the local file: no ads, no login prompt, a seamless
loop, and it keeps playing if the internet drops. The display shows a placeholder while the download
runs; the widget's properties panel shows progress and a "Re-download" button. Videos that are no
longer referenced by any layout are deleted automatically. yt-dlp updates itself daily because
YouTube changes frequently; if downloads start failing, run `sudo /opt/pimarquee/scripts/update.sh`.
If YouTube answers "Sign in to confirm you're not a bot" (it does this for some networks), export your
browser's YouTube cookies in Netscape format (see the yt-dlp wiki) to
`/var/lib/pimarquee/yt-cookies.txt`, readable by the `pimarquee` user; downloads pick the file up
automatically.

**Embed** mode uses YouTube's privacy-enhanced iframe player instead. It needs no login either, but
YouTube may insert ads on monetised videos and the loop restarts with a short black gap.

Each playing video is a software decode on the Pi, like a camera stream: keep to one or two at a time
on a Pi 4.

## Home Assistant

Enable MQTT in Settings and point it at your broker. The display appears as one device with a layout
`select`, a display power `switch`, a reload `button`, a `text` entity for every text widget and
diagnostic sensors. Details and a REST alternative: [docs/home-assistant.md](docs/home-assistant.md).

## API (for the Android app and other integrations)

Everything the admin UI does goes through `/api/v1` plus a WebSocket at `/ws`. Create an API token in
Settings → Security and send it as `Authorization: Bearer <token>`. The server also advertises itself
on the LAN via mDNS as `_pimarquee._tcp`. Full contract: [docs/api.md](docs/api.md).

## Development (Windows / macOS / Linux, no Pi needed)

```bash
npm install
npm run dev        # server :8080, admin UI http://localhost:5173, display http://localhost:5174/display/
npm test           # unit tests (schemas, Pi detection, stream-limit resolver, config store)
npm run build      # production build of all packages
npm start          # run the built server (serves admin at / and display at /display/)
```

To try cameras locally, run go2rtc on your machine: `.\scripts\dev-go2rtc.ps1` (Windows) or download
the binary from the go2rtc releases page and run `go2rtc -config go2rtc/go2rtc.dev.yaml`. Then add a
camera in the admin UI with a real RTSP URL on your LAN, or with ffmpeg installed use the synthetic
source `ffmpeg:virtual?video&size=1280x720&decimals=2#video=h264`.

Config in development lives in `.dev/config.json`.

### Repository layout

```
packages/shared    zod schemas (config, API, resolved layout), defaults, Pi model table
packages/server    Fastify server: REST + WebSocket, config store, go2rtc sync, MQTT, mDNS
packages/display   React page rendered by the kiosk browser
packages/admin     React admin UI with the react-rnd layout editor
scripts/           install.sh, update.sh, uninstall.sh, chromium-kiosk.sh, dev-go2rtc.ps1
systemd/           service units + sudoers snippet
go2rtc/            go2rtc config template (streams block is generated by the server)
docs/              api.md, home-assistant.md, hardware-notes.md
```

## License

MIT. `packages/display/src/vendor/video-rtc.js` is vendored from go2rtc (MIT, see `LICENSE.go2rtc`).
