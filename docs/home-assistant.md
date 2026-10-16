# Home Assistant integration

## Option A: MQTT discovery (recommended)

Requirements: the Home Assistant **MQTT** integration with a broker (Mosquitto add-on is fine).

1. In the piMarquee admin UI open **Settings → Home Assistant (MQTT)**, enter the broker URL
   (`mqtt://<ha-ip>:1883`), username/password, and enable it.
2. Home Assistant discovers a device named after the display (**Settings → Devices**) with:

| Entity | Type | What it does |
|---|---|---|
| Layout | `select` | options are your layout names; changing it switches the display |
| Display power | `switch` | ON/OFF (software blackout + hardware off where supported) |
| Reload display | `button` | reloads the kiosk page |
| *Layout: Widget name* | `text` | one per text widget; writing to it changes the text on screen |
| CPU temperature | `sensor` | °C |
| Active streams | `sensor` | camera streams currently allowed |
| Uptime | `sensor` | seconds (diagnostic) |
| Stream server | `binary_sensor` | go2rtc reachable (diagnostic) |

Availability is published on `<baseTopic>/pimarquee_<name>/availability` with a last-will, so the
device goes *unavailable* if the Pi drops off.

### Topics (for your own automations)

Base = `<baseTopic>/pimarquee_<slug of display name>`, default `pimarquee/pimarquee_pi_display`.

| Topic | Payload |
|---|---|
| `<base>/layout/state` / `<base>/layout/set` | layout name (or id) |
| `<base>/power/state` / `<base>/power/set` | `ON` / `OFF` |
| `<base>/reload/set` | `PRESS` |
| `<base>/text/<widgetId>/state` / `/set` | text content |
| `<base>/sensors/state` | `{"cpuTempC":51.2,"streamsUsed":2,"uptimeSec":1234,"go2rtcReachable":true}` |
| `<base>/availability` | `online` / `offline` |

Discovery configs are retained under `<discoveryPrefix>/<component>/pimarquee_<slug>/<object>/config`.
Renaming the display creates a new device; the old discovery entries can be removed from HA.

### Example automation

```yaml
automation:
  - alias: Kitchen display shows cameras at night
    trigger:
      - platform: sun
        event: sunset
    action:
      - service: select.select_option
        target: { entity_id: select.pi_display_layout }
        data: { option: "Cameras" }
  - alias: Turn the display off when nobody is home
    trigger:
      - platform: state
        entity_id: group.family
        to: not_home
        for: "00:10:00"
    action:
      - service: switch.turn_off
        target: { entity_id: switch.pi_display_display_power }
```

## Option B: REST (no MQTT)

Create an API token in **Settings → Security** and use `rest_command`:

```yaml
rest_command:
  signage_layout:
    url: "http://192.168.1.50:8080/api/v1/layouts/{{ layout_id }}/activate"
    method: POST
    headers: { Authorization: "Bearer YOUR_TOKEN" }
  signage_power:
    url: "http://192.168.1.50:8080/api/v1/display/power"
    method: PUT
    headers: { Authorization: "Bearer YOUR_TOKEN", Content-Type: application/json }
    payload: '{"on": {{ on | lower }}}'
  signage_text:
    url: "http://192.168.1.50:8080/api/v1/layouts/{{ layout_id }}/widgets/{{ widget_id }}"
    method: PATCH
    headers: { Authorization: "Bearer YOUR_TOKEN", Content-Type: application/json }
    payload: '{"content": {{ content | tojson }}}'
```

Layout and widget ids are visible in the admin UI URLs and in `GET /api/v1/widgets/text`.

## Showing Home Assistant *on* the display

Add a **Web page** widget with a dashboard URL, e.g. `http://<ha-ip>:8123/lovelace/0`.

The admin **Live preview** runs in *your* browser, which is already logged into Home Assistant, so
it is not a reliable test of what the Pi will show. The kiosk is a separate Chromium on the Pi with
no logins. Three things have to be true for it to work there:

1. **Framing allowed.** Home Assistant refuses to be shown in a frame unless `configuration.yaml`
   has:

   ```yaml
   http:
     use_x_frame_options: false
   ```

   (The widget's "Proxy through server" option strips the header instead, but Home Assistant's
   frontend loads many assets by absolute URL, so the direct setting is the better choice.)

2. **Reachable from the Pi.** Prefer the IP address over `homeassistant.local`; the installer adds
   mDNS resolution to the Pi, but an IP never depends on it. If Home Assistant uses HTTPS with a
   self-signed certificate, Chromium silently refuses to frame it; use plain HTTP on the LAN, a real
   certificate, or add `--ignore-certificate-errors` to `CHROMIUM_EXTRA_FLAGS` in
   `/etc/pimarquee/env` (LAN-only setups).

3. **Logged in without a keyboard.** Use Home Assistant's trusted-networks auth provider so the Pi
   is logged in automatically:

   ```yaml
   homeassistant:
     auth_providers:
       - type: homeassistant
       - type: trusted_networks
         trusted_networks:
           - 192.168.1.50/32        # the Pi's IP
         trusted_users:
           192.168.1.50: a1b2c3...  # user id from Settings → People → user → ID
         allow_bypass_login: true
   ```

   Restart Home Assistant, then reload the display. Make a dedicated non-admin "display" user for
   this. Alternatively plug a keyboard into the Pi once and log in; the session is kept in the
   kiosk's Chromium profile.

For a cleaner look install the "kiosk-mode" HACS frontend plugin in Home Assistant and append
`?kiosk` to the dashboard URL to hide its header and sidebar.

To check from the Pi itself what the kiosk will get:

```bash
curl -sS -o /dev/null -D - http://<ha-ip>:8123/ | grep -iE "^HTTP|x-frame|location"
```

A `200` with no `x-frame-options` line is what you want.
