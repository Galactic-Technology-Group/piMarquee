#!/usr/bin/env bash
# Update an installed pimarquee from this checkout (or from git if run inside /opt/pimarquee).
#   sudo /opt/pimarquee/scripts/update.sh        # git pull + rebuild + restart
#   sudo ./scripts/update.sh                       # from a fresh checkout elsewhere: copy + rebuild
set -euo pipefail
APP_DIR="/opt/pimarquee"
APP_USER="pimarquee"
SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
[[ $EUID -eq 0 ]] || { echo "run with sudo" >&2; exit 1; }

systemctl stop pimarquee-kiosk.service || true

if [[ "$SRC_DIR" == "$APP_DIR" ]]; then
  if [[ -d "$APP_DIR/.git" ]]; then
    sudo -u "$APP_USER" -H git -C "$APP_DIR" pull --ff-only
  fi
else
  rsync -a --delete --exclude node_modules --exclude .git --exclude .dev --exclude 'packages/*/dist' "$SRC_DIR/" "$APP_DIR/"
  chown -R "$APP_USER:$APP_USER" "$APP_DIR"
fi

sudo -u "$APP_USER" -H bash -c "cd '$APP_DIR' && npm install --no-audit --no-fund --loglevel=error && npm run build && npm prune --omit=dev --no-audit --no-fund --loglevel=error"

install -m 0644 "$APP_DIR/systemd/go2rtc.service" /etc/systemd/system/go2rtc.service
install -m 0644 "$APP_DIR/systemd/pimarquee.service" /etc/systemd/system/pimarquee.service
install -m 0644 "$APP_DIR/systemd/pimarquee-kiosk.service" /etc/systemd/system/pimarquee-kiosk.service
install -m 0755 "$APP_DIR/scripts/chromium-kiosk.sh" /usr/local/bin/pimarquee-kiosk
install -m 0755 "$APP_DIR/scripts/wait-for-http.sh" /usr/local/bin/pimarquee-wait-for-http
install -m 0440 "$APP_DIR/systemd/pimarquee-sudoers" /etc/sudoers.d/pimarquee
install -o "$APP_USER" -g "$APP_USER" -m 0644 "$APP_DIR/go2rtc/go2rtc.template.yaml" /etc/go2rtc/go2rtc.template.yaml

# Keep yt-dlp current (YouTube widget); the standalone binary updates itself in place.
if [[ -x /var/lib/pimarquee/bin/yt-dlp ]]; then
  sudo -u "$APP_USER" /var/lib/pimarquee/bin/yt-dlp -U || true
fi

systemctl daemon-reload
systemctl restart go2rtc.service pimarquee.service
systemctl start pimarquee-kiosk.service
echo "pimarquee updated and restarted."
