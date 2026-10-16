# piMarquee API (v1)

Base URL: `http://<pi>:8080`. All bodies and responses are JSON unless noted. This is the contract
the Android app and Home Assistant integration build on; breaking changes bump the version prefix.

## Discovery

The server advertises `_pimarquee._tcp` over mDNS/Bonjour with TXT `version` and `path=/api/v1`.
Resolve it to get the host and port instead of asking the user to type an IP.

## Authentication

- If no admin password is set, everything is open.
- Requests from the Pi itself (loopback) are always allowed; that is how the kiosk page works.
- Otherwise send `Authorization: Bearer <token>` (create tokens in Settings → Security or via
  `POST /api/v1/auth/tokens`) or use the session cookie from `POST /api/v1/auth/login`.
- For the WebSocket, pass `?token=<token>` in the URL (browsers cannot set headers on WS upgrades).
- A `401 {"error":"unauthorized"}` is returned otherwise.

`GET /api/v1/auth/status` → `{enabled, authenticated, loopback}` (never requires auth).

## Errors

`4xx/5xx` with `{"error": "...", "details": [...]?}`. Validation errors are `400` with a list of
`{path, message}`.

## Status

| Method | Path | Returns |
|---|---|---|
| GET | `/health` | `{ok:true, version}` – no auth |
| GET | `/api/v1/status` | version, uptime, CPU temp, load, memory, `throttled` hex + `throttledFlags[]`, `go2rtc{reachable,streams}`, `display{connected,resolution,activeLayoutId,power}`, `mqtt{enabled,connected}`, `pi{family,model,ramMB}` |
| GET | `/api/v1/system/pi` | detection detail: `family`, `familyLabel`, `modelString`, `revisionHex`, `ramMB`, `defaultMaxStreams`, `effectiveMaxStreams`, `maxStreamsSource` (`detected`/`override`), `systemControl` |

## Layouts

| Method | Path | Body / notes |
|---|---|---|
| GET | `/api/v1/layouts` | `[{id,name,widgetCount,cameraWidgets,updatedAt,isActive}]` |
| POST | `/api/v1/layouts` | `{name}` → full layout (201) |
| GET | `/api/v1/layouts/:id` | full layout |
| PUT | `/api/v1/layouts/:id` | `{name, background, widgets[]}` replaces the layout (editor autosave) |
| DELETE | `/api/v1/layouts/:id` | 204; if it was active, the first remaining layout becomes active |
| POST | `/api/v1/layouts/:id/duplicate` | → new layout (201) |
| POST | `/api/v1/layouts/:id/activate` | shows it on the display → `{activeLayoutId}` |
| PATCH | `/api/v1/layouts/:id/widgets/:wid` | partial widget update, e.g. `{"content":"Dinner at 6"}` or `{"visible":false}` or `{"url":"https://…"}` → updated widget |
| GET | `/api/v1/widgets/text` | every text widget: `[{layoutId,layoutName,widgetId,name,content}]` |

### Widget schema

Geometry is in **percent of the screen** (`rect: {x,y,w,h}`, 0–100). Common fields:
`id, type, name, rect, z, opacity, visible, background, borderRadius`.

- `camera`: `cameraId, fit (cover|contain), mode (auto|webrtc|mse|mjpeg), priority, showLabel, muted`
- `webpage`: `url, refreshIntervalSec|null, stripFrameHeaders, zoom, allowScripts`
- `text`: `content, fontFamily, fontSize (% of screen height), color, align, valign, bold, italic, padding`
- `clock`: `showTime, showDate, showSeconds, hour12, dateFormat (long|short|numeric), timezone|null, locale|null, fontFamily, fontSize, color, align`
- `youtube`: `url, mode (download|embed), loop, muted, fit (cover|contain), maxHeight (360|480|720|1080), startSec`. In the resolved layout the widget also carries `videoId` and `media` (download state, see below).

The authoritative definitions are the zod schemas in `packages/shared/src/schema/config.ts`.

## Media (YouTube downloads)

| Method | Path | Body / notes |
|---|---|---|
| GET | `/api/v1/media` | `[{videoId, status (pending|downloading|ready|error|unavailable), src, title, bytes, error, updatedAt}]` |
| POST | `/api/v1/media/:videoId/refresh` | delete and re-download that video |
| GET | `/media/<videoId>.mp4` | the downloaded file (supports Range requests) |

Downloads are driven by the layouts: saving a layout with a `youtube` widget in `download` mode
queues the video; removing the last reference deletes the file. A `config.changed` WebSocket message
with scope `media` is sent whenever a download state changes.

## Cameras

| Method | Path | Body / notes |
|---|---|---|
| GET | `/api/v1/cameras` | list; RTSP credentials are redacted (`hasCredentials` flag) |
| POST | `/api/v1/cameras` | `{name, rtspUrl, enabled?, notes?}` (201) |
| GET/PUT/DELETE | `/api/v1/cameras/:id` | PUT accepts partial; a redacted URL means "unchanged". DELETE also removes widgets using it |
| POST | `/api/v1/cameras/:id/test` | probes via go2rtc → `{ok, medias[], hasH264, hasH265, error, warnings[]}` |
| GET | `/api/v1/cameras/:id/snapshot.jpg` | JPEG frame (image/jpeg) |

## Display control

| Method | Path | Body / notes |
|---|---|---|
| GET | `/api/v1/display` | `{activeLayoutId, power, connectedClients, resolution}` |
| PUT | `/api/v1/display/active-layout` | `{layoutId}` (or `null` for a blank screen) |
| PUT | `/api/v1/display/power` | `{on: true|false}` – software blackout always; hardware off when the Pi supports it |
| POST | `/api/v1/display/reload` | `{hard?: boolean}` – reload the page, or restart the kiosk browser |
| GET | `/api/v1/display/resolved?layoutId=` | what the display renders: widgets with resolved stream info (`stream.allowed`, `reason`, `mode`, `port`) and `maxStreams`, `streamsUsed` |

## Settings & system

| Method | Path | Body / notes |
|---|---|---|
| GET/PUT | `/api/v1/settings` | PUT accepts a partial object (deep-merged). MQTT password is write-only (`hasPassword` in GET) |
| GET/PUT | `/api/v1/config` | export / import the whole config (secrets are kept from the current config) |
| POST | `/api/v1/system/restart` | `{service: "go2rtc"|"kiosk"|"server"}` (Pi only) |
| POST | `/api/v1/system/reboot` | (Pi only) |

## Auth management

| Method | Path | Body / notes |
|---|---|---|
| POST | `/api/v1/auth/login` | `{password}` → sets `sid` cookie |
| POST | `/api/v1/auth/logout` | |
| PUT | `/api/v1/auth/password` | `{password}` or `{password:null}` to disable auth |
| GET | `/api/v1/auth/tokens` | `[{id,name,createdAt,lastUsedAt}]` |
| POST | `/api/v1/auth/tokens` | `{name}` → `{id,name,token}` – the plaintext token is returned once |
| DELETE | `/api/v1/auth/tokens/:id` | |

## Frame-header proxy

`GET /proxy/:widgetId/*` fetches the webpage widget's origin through the server with
`X-Frame-Options`/CSP stripped. Only works for widgets with `stripFrameHeaders: true`; not an open proxy.

## WebSocket `/ws?role=display|admin[&token=]`

Text frames, JSON. Client → server:

```json
{"type":"hello","role":"admin","resolution":{"w":1920,"h":1080},"userAgent":"…"}
{"type":"ping"}
```

Server → client:

| type | payload | audience |
|---|---|---|
| `welcome` | `{serverVersion, rev}` | all |
| `config.changed` | `{rev, scope}` where scope ∈ `layouts|cameras|settings|display|auth|all` – refetch what you show | admin |
| `display.resolved` | `{resolved}` the full resolved active layout | display |
| `display.power` | `{on}` | display |
| `display.reload` | `{hard}` | display |
| `status` | the same object as `GET /api/v1/status` (every 10 s) | admin |
| `pong` | | |

An Android app should connect as `admin`, refetch `/layouts` + `/display` on `config.changed`, and use
`status` for the live health strip.

## Example: switch layout and set a text from a shell

```bash
TOKEN=...; PI=http://192.168.1.50:8080
curl -s -H "Authorization: Bearer $TOKEN" $PI/api/v1/layouts
curl -s -X POST -H "Authorization: Bearer $TOKEN" $PI/api/v1/layouts/<id>/activate
curl -s -X PATCH -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' \
     -d '{"content":"Back in 10 minutes"}' $PI/api/v1/layouts/<id>/widgets/<wid>
curl -s -X PUT -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' \
     -d '{"on":false}' $PI/api/v1/display/power
```
