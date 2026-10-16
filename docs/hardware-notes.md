# Hardware notes & things to verify on a real Pi

This project was developed and unit-tested on a laptop. The pieces below depend on Raspberry Pi
hardware and the Bookworm/Trixie Wayland stack and should be checked on the first install.
Each item lists what to look at and the fallback if it misbehaves.

## 1. Kiosk session: cage + Chromium on Wayland

`pimarquee-kiosk.service` runs `cage -d -- /usr/local/bin/pimarquee-kiosk` as the `pimarquee` user with
`PAMName=login` + `TTYPath=/dev/tty1`, which gives it a logind seat so it can open DRM and input
devices without root. `WLR_LIBINPUT_NO_DEVICES=1` lets it start with no keyboard attached.

Check: `journalctl -u pimarquee-kiosk -b`. The screen should show the display page ~30 s after boot.

Known gotchas:
- **Black screen, cage exits** – usually no DRM access. Confirm `dtoverlay=vc4-kms-v3d` in
  `/boot/firmware/config.txt`, that `pimarquee` is in `video`,`render`,`input`, and that `seatd` or
  logind is providing the seat (`loginctl list-sessions`).
- **Chromium opens but is tiny / not fullscreen** – add `--force-device-scale-factor=1` or
  `--window-size=1920,1080` via `CHROMIUM_EXTRA_FLAGS` in `/etc/pimarquee/env`.
- **Package name** – Bookworm's package is `chromium` (binary `/usr/bin/chromium`); the installer
  probes for `chromium-browser` too and writes `CHROMIUM_BIN` to the env file.
- **Fallbacks** – if cage misbehaves, `labwc` or `weston --shell=kiosk-shell` can replace it in the
  unit's `ExecStart`; or go X11: `apt install xserver-xorg xinit` and run
  `xinit /usr/local/bin/pimarquee-kiosk -- :0 vt1` with `--ozone-platform=x11`.

## 2. Video decoding on a Pi 4

Chromium on the Pi does **not** reliably use the Pi 4's hardware H.264 decoder for WebRTC/MSE, so
expect software decoding. Rough capacity (CPU-bound):

| Model | 720p H.264 streams | 1080p streams |
|---|---|---|
| Pi 5 | 4+ | 2–3 |
| Pi 4 (2–8 GB) | 2 (maybe 3) | 1 |
| Pi 3 / Zero 2 W | 1 (low fps) | – |

What to do:
- Always use the camera's **sub-stream** (640×360–1280×720, H.264, ≤15 fps).
- Check `chrome://media-internals` (plug in a keyboard, press F11 to leave kiosk) to see which
  decoder is in use. Try the commented `--enable-features=…VideoDecodeLinuxGL` flags in
  `scripts/chromium-kiosk.sh` and compare CPU with `htop`.
- If CPU is pegged, switch widgets to **MJPEG** mode (go2rtc transcodes server-side only if the camera
  supports MJPEG natively; otherwise it costs CPU too) or lower the stream limit.
- Keep an eye on `vcgencmd get_throttled` (shown on the Settings page). `0x50000` = has throttled.
- H.265/HEVC cannot be played via WebRTC in Chromium; the camera test warns about it.

## 3. Display power on/off

`PUT /api/v1/display/power` always applies a software blackout on the page. In addition the server tries,
in order (`displayPowerMethod: auto`):

1. `wlr-randr --output <name> --off/--on` against the kiosk's Wayland socket (`/run/user/<uid>/wayland-*`).
   Requires cage to expose `wlr-output-management`; verify with `wlr-randr` as the `pimarquee` user:
   `sudo -u pimarquee XDG_RUNTIME_DIR=/run/user/$(id -u pimarquee) WAYLAND_DISPLAY=wayland-0 wlr-randr`.
   Turning off the only output may make Chromium re-layout when it comes back; if the page is blank
   afterwards, press "Reload display".
2. `cec-ctl --to 0 --standby` / `--image-view-on` (TV must support HDMI-CEC; enable it on the TV).
3. Software only.

`vcgencmd display_power` is **not** used: it is unreliable under the KMS driver.

## 4. go2rtc

- Runs as its own unit from `/etc/go2rtc/go2rtc.yaml`. The server rewrites the `streams:` section
  from the camera list and reconciles the running instance through `PUT/DELETE /api/streams`, so
  adding a camera needs no restart. Restart go2rtc only after editing the static part of the YAML.
- Browser → go2rtc: the display page connects to `ws://<host>:1984/api/ws?src=cam_<id>`. From the
  kiosk `<host>` is `127.0.0.1`; from the admin preview it is the Pi's LAN IP. go2rtc listens on all
  interfaces; WebRTC uses port 8555 TCP/UDP. If a LAN preview shows no video but the kiosk does, ICE
  candidate selection is the suspect — MSE mode works without WebRTC.
- go2rtc web UI (handy for debugging): `http://<pi>:1984/`.

## 5. Memory / long runs

Chromium + go2rtc + 2 streams fits in 2 GB. On 1 GB boards the stream limit defaults to 1. If memory
creeps up over days, set **Auto-reload every N hours** in Settings (reloads the page, not the browser).
A watchdog in the camera widget rebuilds a player that has produced no frames for 20 s.

## 6. Clock accuracy

The Pi has no real-time clock. The clock widget is wrong until NTP syncs after boot (seconds to a
minute). `timedatectl` shows the sync state.

## 7. Audio

Camera widgets are muted by default. Unmuting requests the audio track; whether it plays depends on
the camera's codec (AAC/Opus/PCMU work; others do not) and on HDMI audio being routed in Chromium.

## 8. Mouse pointer on the display

cage hides the pointer only when no pointer device is attached; a mouse, or a wireless keyboard whose
receiver also enumerates as a mouse, makes it draw the default arrow. The focused window can then hide
it, so the display page requests `cursor: none` everywhere and, with **Settings → Hide the mouse
pointer on the display** (default on), covers the screen with a transparent layer so the pointer stays
hidden even over embedded web pages, whose documents would otherwise set their own cursor. That layer
also blocks mouse/touch interaction with embedded pages; switch it off for a touchscreen dashboard.
If the arrow still shows on an older cage with no mouse attached, unplug any USB receiver you are not
using, or upgrade cage (0.1.5+ hides the pointer without a device).
