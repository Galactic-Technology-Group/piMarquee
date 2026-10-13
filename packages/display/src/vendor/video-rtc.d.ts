export class VideoRTC extends HTMLElement {
  DISCONNECT_TIMEOUT: number;
  RECONNECT_TIMEOUT: number;
  CODECS: string[];
  mode: string;
  media: string;
  background: boolean;
  visibilityThreshold: number;
  visibilityCheck: boolean;
  pcConfig: RTCConfiguration;
  wsState: number;
  pcState: number;
  video: HTMLVideoElement;
  ws: WebSocket | null;
  wsURL: string;
  pc: RTCPeerConnection | null;
  set src(value: string | URL);
  play(): void;
  send(value: unknown): void;
  oninit(): void;
  onconnect(): boolean;
  ondisconnect(): void;
}
