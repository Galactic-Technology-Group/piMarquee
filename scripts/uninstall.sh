#!/usr/bin/env bash
# Remove pimarquee services and code. Keeps /var/lib/pimarquee (config) unless --purge is given.
set -euo pipefail
[[ $EUID -eq 0 ]] || { echo "run with sudo" >&2; exit 1; }
PURGE=0; [[ "${1:-}" == "--purge" ]] && PURGE=1

systemctl disable --now pimarquee-kiosk.service pimarquee.service go2rtc.service 2>/dev/null || true
rm -f /etc/systemd/system/pimarquee-kiosk.service /etc/systemd/system/pimarquee.service /etc/systemd/system/go2rtc.service
rm -f /usr/local/bin/pimarquee-kiosk /usr/local/bin/pimarquee-wait-for-http /etc/sudoers.d/pimarquee
rm -rf /opt/pimarquee /etc/pimarquee
systemctl daemon-reload
systemctl enable getty@tty1.service >/dev/null 2>&1 || true
systemctl set-default multi-user.target >/dev/null 2>&1 || true

if [[ $PURGE -eq 1 ]]; then
  rm -rf /var/lib/pimarquee /etc/go2rtc /usr/local/bin/go2rtc
  userdel pimarquee 2>/dev/null || true
  echo "pimarquee removed, including config and go2rtc."
else
  echo "pimarquee removed. Config kept in /var/lib/pimarquee (use --purge to delete it)."
fi
