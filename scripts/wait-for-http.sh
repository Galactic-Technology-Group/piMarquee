#!/usr/bin/env bash
# Usage: wait-for-http.sh <url> [timeout-seconds]
# Blocks until the URL answers 2xx, so the kiosk does not open Chromium on a connection-refused page.
url="${1:?url}"
timeout="${2:-60}"
for ((i = 0; i < timeout; i++)); do
  if curl -fsS -o /dev/null --max-time 2 "$url"; then
    exit 0
  fi
  sleep 1
done
echo "wait-for-http: $url not ready after ${timeout}s; starting anyway" >&2
exit 0
