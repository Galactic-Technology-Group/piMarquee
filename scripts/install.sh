#!/usr/bin/env bash
# piMarquee installer for Raspberry Pi OS Lite (64-bit, Bookworm or newer).
#
#   sudo ./scripts/install.sh            # install from this checkout (builds on the Pi)
#   sudo PORT=8080 ./scripts/install.sh  # override the HTTP port
#
# Idempotent: safe to re-run after `git pull` (or use scripts/update.sh).
set -euo pipefail

APP_USER="pimarquee"
APP_DIR="/opt/pimarquee"
DATA_DIR="/var/lib/pimarquee"
ENV_FILE="/etc/pimarquee/env"
GO2RTC_VERSION="${GO2RTC_VERSION:-1.9.14}"
GO2RTC_BIN="/usr/local/bin/go2rtc"
GO2RTC_CONF_DIR="/etc/go2rtc"
PORT="${PORT:-8080}"
NODE_MAJOR="${NODE_MAJOR:-22}"

SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

log()  { printf '\033[1;34m[pimarquee]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[pimarquee]\033[0m %s\n' "$*"; }
die()  { printf '\033[1;31m[pimarquee]\033[0m %s\n' "$*" >&2; exit 1; }

[[ $EUID -eq 0 ]] || die "run with sudo"
ARCH="$(dpkg --print-architecture)"
[[ "$ARCH" == "arm64" ]] || die "64-bit Raspberry Pi OS is required (found: $ARCH). Re-image with the 64-bit Lite image."
[[ -d /boot/firmware ]] || warn "/boot/firmware not found; are you on Raspberry Pi OS Bookworm or newer?"

# --- packages -----------------------------------------------------------------
log "Installing system packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq --no-install-recommends \
  chromium cage wlr-randr seatd libgles2 \
  fonts-dejavu fonts-noto-core \
  curl ca-certificates jq git rsync avahi-daemon libnss-mdns ffmpeg \
  cec-utils libcec6 2>/dev/null || \
apt-get install -y -qq --no-install-recommends \
  chromium cage wlr-randr seatd libgles2 fonts-dejavu fonts-noto-core curl ca-certificates jq git rsync avahi-daemon libnss-mdns ffmpeg

CHROMIUM_BIN="$(command -v chromium || command -v chromium-browser || true)"
[[ -n "$CHROMIUM_BIN" ]] || die "chromium not found after install"
log "Chromium: $CHROMIUM_BIN"

# --- Node.js ------------------------------------------------------------------
if ! command -v node >/dev/null || [[ "$(node -p 'process.versions.node.split(".")[0]')" -lt "$NODE_MAJOR" ]]; then
  log "Installing Node.js $NODE_MAJOR from NodeSource"
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash - >/dev/null
  apt-get install -y -qq nodejs
fi
log "Node $(node --version), npm $(npm --version)"

# --- go2rtc -------------------------------------------------------------------
if [[ ! -x "$GO2RTC_BIN" ]] || ! "$GO2RTC_BIN" --version 2>/dev/null | grep -q "$GO2RTC_VERSION"; then
  log "Installing go2rtc $GO2RTC_VERSION"
  curl -fsSL -o "$GO2RTC_BIN.tmp" "https://github.com/AlexxIT/go2rtc/releases/download/v${GO2RTC_VERSION}/go2rtc_linux_arm64"
  chmod +x "$GO2RTC_BIN.tmp"
  mv "$GO2RTC_BIN.tmp" "$GO2RTC_BIN"
fi
log "go2rtc: $("$GO2RTC_BIN" --version 2>&1 | head -1)"

# --- user & directories -------------------------------------------------------
if ! id "$APP_USER" >/dev/null 2>&1; then
  log "Creating user $APP_USER"
  useradd --system --create-home --home-dir "$DATA_DIR" --shell /usr/sbin/nologin "$APP_USER"
fi
for g in video render input audio tty; do
  getent group "$g" >/dev/null && usermod -aG "$g" "$APP_USER"
done
# A lingering user session gives the backend an XDG_RUNTIME_DIR for wlr-randr at boot.
loginctl enable-linger "$APP_USER" 2>/dev/null || true

mkdir -p "$DATA_DIR/chromium" "$DATA_DIR/media" "$DATA_DIR/bin" "$GO2RTC_CONF_DIR" "$(dirname "$ENV_FILE")" "$APP_DIR"

# --- yt-dlp (YouTube widget) --------------------------------------------------
# Lives in the data dir, owned by the service user, so the server can run `yt-dlp -U` itself:
# YouTube changes often and a stale yt-dlp stops downloading within weeks.
YTDLP_BIN="$DATA_DIR/bin/yt-dlp"
if [[ ! -x "$YTDLP_BIN" ]]; then
  log "Installing yt-dlp"
  curl -fsSL -o "$YTDLP_BIN.tmp" "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux_aarch64"
  chmod +x "$YTDLP_BIN.tmp"
  mv "$YTDLP_BIN.tmp" "$YTDLP_BIN"
fi
log "yt-dlp: $("$YTDLP_BIN" --version 2>&1 | head -1)"
chown -R "$APP_USER:$APP_USER" "$DATA_DIR"

# --- application code ---------------------------------------------------------
if [[ "$SRC_DIR" != "$APP_DIR" ]]; then
  log "Copying source to $APP_DIR"
  rsync -a --delete --exclude node_modules --exclude .git --exclude .dev --exclude 'packages/*/dist' "$SRC_DIR/" "$APP_DIR/" 2>/dev/null || {
    rm -rf "$APP_DIR"; mkdir -p "$APP_DIR"; cp -r "$SRC_DIR/." "$APP_DIR/"; rm -rf "$APP_DIR/node_modules" "$APP_DIR/.git" "$APP_DIR/.dev"
  }
fi
chown -R "$APP_USER:$APP_USER" "$APP_DIR"

log "Installing npm dependencies and building (this takes a few minutes on a Pi 4)"
sudo -u "$APP_USER" -H bash -c "cd '$APP_DIR' && npm install --no-audit --no-fund --loglevel=error && npm run build"
# Prune dev dependencies to save space.
sudo -u "$APP_USER" -H bash -c "cd '$APP_DIR' && npm prune --omit=dev --no-audit --no-fund --loglevel=error" || true

# --- config files -------------------------------------------------------------
if [[ ! -f "$DATA_DIR/config.json" ]]; then
  log "Seeding default config"
  install -o "$APP_USER" -g "$APP_USER" -m 0640 "$APP_DIR/config/config.example.json" "$DATA_DIR/config.json"
fi

if [[ ! -f "$GO2RTC_CONF_DIR/go2rtc.yaml" ]]; then
  install -o "$APP_USER" -g "$APP_USER" -m 0640 "$APP_DIR/go2rtc/go2rtc.template.yaml" "$GO2RTC_CONF_DIR/go2rtc.yaml"
fi
install -o "$APP_USER" -g "$APP_USER" -m 0644 "$APP_DIR/go2rtc/go2rtc.template.yaml" "$GO2RTC_CONF_DIR/go2rtc.template.yaml"
chown "$APP_USER:$APP_USER" "$GO2RTC_CONF_DIR"

cat > "$ENV_FILE" <<EOF
NODE_ENV=production
PORT=$PORT
HOST=0.0.0.0
CONFIG_PATH=$DATA_DIR/config.json
GO2RTC_URL=http://127.0.0.1:1984
GO2RTC_CONFIG=$GO2RTC_CONF_DIR/go2rtc.yaml
GO2RTC_TEMPLATE=$GO2RTC_CONF_DIR/go2rtc.template.yaml
CHROMIUM_BIN=$CHROMIUM_BIN
KIOSK_URL=http://127.0.0.1:$PORT/display/
MEDIA_DIR=$DATA_DIR/media
YTDLP_BIN=$YTDLP_BIN
YTDLP_EXTRA_ARGS=--js-runtimes node
LOG_LEVEL=info
EOF
chmod 0644 "$ENV_FILE"

# --- sudoers: let the service user restart units / reboot ---------------------
install -m 0440 "$APP_DIR/systemd/pimarquee-sudoers" /etc/sudoers.d/pimarquee
visudo -cf /etc/sudoers.d/pimarquee >/dev/null || die "sudoers file invalid"

# --- systemd units ------------------------------------------------------------
log "Installing systemd units"
install -m 0644 "$APP_DIR/systemd/go2rtc.service" /etc/systemd/system/go2rtc.service
install -m 0644 "$APP_DIR/systemd/pimarquee.service" /etc/systemd/system/pimarquee.service
install -m 0644 "$APP_DIR/systemd/pimarquee-kiosk.service" /etc/systemd/system/pimarquee-kiosk.service
install -m 0755 "$APP_DIR/scripts/chromium-kiosk.sh" /usr/local/bin/pimarquee-kiosk
install -m 0755 "$APP_DIR/scripts/wait-for-http.sh" /usr/local/bin/pimarquee-wait-for-http

# --- boot tweaks: no console blanking, KMS driver -----------------------------
CMDLINE=/boot/firmware/cmdline.txt
if [[ -f "$CMDLINE" ]] && ! grep -q consoleblank=0 "$CMDLINE"; then
  sed -i 's/$/ consoleblank=0/' "$CMDLINE"
fi
CONFIG_TXT=/boot/firmware/config.txt
if [[ -f "$CONFIG_TXT" ]] && ! grep -q '^dtoverlay=vc4-kms-v3d' "$CONFIG_TXT"; then
  warn "dtoverlay=vc4-kms-v3d not found in $CONFIG_TXT; the KMS driver is required for cage. Adding it."
  echo 'dtoverlay=vc4-kms-v3d' >> "$CONFIG_TXT"
fi

# --- enable & start -----------------------------------------------------------
systemctl daemon-reload
systemctl disable getty@tty1.service >/dev/null 2>&1 || true
systemctl set-default graphical.target >/dev/null
systemctl enable go2rtc.service pimarquee.service pimarquee-kiosk.service >/dev/null
systemctl restart go2rtc.service pimarquee.service
systemctl restart pimarquee-kiosk.service || true

IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
log "Done."
echo
echo "  Admin UI:   http://${IP:-<pi-ip>}:$PORT/   (also http://$(hostname).local:$PORT/)"
echo "  Display:    the HDMI output should show the kiosk within ~30 s"
echo "  Logs:       journalctl -u pimarquee -f      journalctl -u pimarquee-kiosk -f      journalctl -u go2rtc -f"
echo "  Config:     $DATA_DIR/config.json"
echo
echo "  If the screen stays blank, see docs/hardware-notes.md."
