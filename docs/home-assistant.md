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

Add a **Web page** widget with a dashboard URL in kiosk mode, e.g.
`http://<ha-ip>:8123/lovelace/0?kiosk`. Home Assistant blocks framing by default; set
`http: use_x_frame_options: false` in `configuration.yaml` (or enable the widget's "Proxy through
server" option). Authentication: log in once on the Pi's Chromium (plug in a keyboard, or use a
long-lived access token with a kiosk add-on).
