#!/usr/bin/env bash
# Launched by cage (see systemd/pimarquee-kiosk.service). Runs Chromium full-screen on the display page.
set -u
[[ -f /etc/pimarquee/env ]] && set -a && . /etc/pimarquee/env && set +a

CHROMIUM_BIN="${CHROMIUM_BIN:-$(command -v chromium || command -v chromium-browser)}"
KIOSK_URL="${KIOSK_URL:-http://127.0.0.1:8080/display/}"
PROFILE="${KIOSK_PROFILE:-/var/lib/pimarquee/chromium}"
mkdir -p "$PROFILE"

# Chromium refuses to start (or nags about a crash) if a previous run was killed.
rm -f "$PROFILE"/Singleton* 2>/dev/null
if [[ -f "$PROFILE/Default/Preferences" ]] && command -v jq >/dev/null; then
  tmp="$(mktemp)"
  jq '.profile.exit_type="Normal" | .profile.exited_cleanly=true' "$PROFILE/Default/Preferences" > "$tmp" 2>/dev/null && mv "$tmp" "$PROFILE/Default/Preferences" || rm -f "$tmp"
fi

FLAGS=(
  --kiosk
  --ozone-platform=wayland
  --user-data-dir="$PROFILE"
  --no-first-run
  --noerrdialogs
  --disable-infobars
  --disable-session-crashed-bubble
  --disable-features=TranslateUI,Translate
  --autoplay-policy=no-user-gesture-required
  --disable-pinch
  --overscroll-history-navigation=0
  --check-for-update-interval=31536000
  --disable-component-update
  --password-store=basic
  --ignore-gpu-blocklist
  --enable-gpu-rasterization
  --enable-zero-copy
  --start-fullscreen
  --hide-scrollbars
)
# Pi hardware video decode under Chromium/Wayland is not guaranteed. Uncomment to experiment and
# compare CPU use in chrome://media-internals (see docs/hardware-notes.md):
# FLAGS+=(--enable-features=VaapiVideoDecodeLinuxGL,AcceleratedVideoDecodeLinuxGL)
# Extra flags from the environment file, e.g. CHROMIUM_EXTRA_FLAGS="--force-device-scale-factor=1"
if [[ -n "${CHROMIUM_EXTRA_FLAGS:-}" ]]; then
  # shellcheck disable=SC2206
  FLAGS+=($CHROMIUM_EXTRA_FLAGS)
fi

exec "$CHROMIUM_BIN" "${FLAGS[@]}" "$KIOSK_URL"
