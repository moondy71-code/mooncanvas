import { decryptLivePayload, encryptLivePayload, type EncryptedLivePayload } from "./crypto";
import { LIVE_PROTOCOL_VERSION, parseLiveMessage, type LiveEnvelope, type LiveRole } from "./protocol";

type Status = "connecting" | "connected" | "reconnecting" | "disconnected" | "error";

export interface LiveTransportOptions {
  relayUrl: string;
  sessionId: string;
  role: LiveRole;
  key: CryptoKey;
  /** Returns a short-lived relay token. It may rotate a browser-held refresh secret. */
  getToken: () => Promise<string>;
  onStatus: (status: Status, detail?: string) => void;
  onDiff: (changes: unknown) => void;
  onSnapshot: (records: unknown[]) => void;
  onSnapshotRequired: () => void;
  onPageChange: (pageId: string) => void;
  onRecordingConsent: (granted: boolean) => void;
}

const isEncrypted = (value: unknown): value is EncryptedLivePayload =>
  !!value && typeof value === "object" && typeof (value as EncryptedLivePayload).iv === "string" && typeof (value as EncryptedLivePayload).ciphertext === "string";

/** Browser-only encrypted WebSocket adapter. The relay sees message routing metadata, never drawing content. */
export class LiveTransport {
  private socket: WebSocket | null = null;
  private sequence = 0;
  private stopped = false;
  private retry: number | null = null;
  private opening = false;
  private attempts = 0;

  constructor(private readonly options: LiveTransportOptions) {}

  start() {
    this.stopped = false;
    window.addEventListener("online", this.resume);
    document.addEventListener("visibilitychange", this.onVisibilityChange);
    void this.open();
  }

  stop() {
    this.stopped = true;
    if (this.retry !== null) window.clearTimeout(this.retry);
    this.retry = null;
    this.socket?.close(1000, "Session page closed");
    this.socket = null;
    window.removeEventListener("online", this.resume);
    document.removeEventListener("visibilitychange", this.onVisibilityChange);
    this.options.onStatus("disconnected");
  }

  async sendDiff(changes: unknown) {
    await this.send("diff", { changes: await this.encrypt(changes, "diff") });
  }

  async sendSnapshot(records: unknown[]) {
    // `records` remains an array for bounded relay validation; its sole entry is encrypted drawing content.
    await this.send("snapshot", { records: [await this.encrypt(records, "snapshot")], lastSequence: this.sequence });
  }

  async sendPageChange(pageId: string) {
    await this.send("page-change", { pageId });
  }

  async endSession() {
    if (this.options.role === "therapist") await this.send("session-end", { at: new Date().toISOString() });
  }

  async sendRecordingConsent(granted: boolean) {
    if (this.options.role === "client") await this.send("recording-consent", { granted, at: new Date().toISOString() });
  }

  private async open() {
    if (this.stopped || this.opening) return;
    this.opening = true;
    this.options.onStatus(this.socket ? "reconnecting" : "connecting");
    let token: string;
    try {
      token = await this.options.getToken();
    } catch (error) {
      this.opening = false;
      const fatal = Boolean(error && typeof error === "object" && "fatal" in error && (error as { fatal?: unknown }).fatal);
      this.options.onStatus("error", error instanceof Error ? error.message : "Could not refresh the secure connection.");
      if (!fatal) this.scheduleReconnect();
      return;
    }
    this.opening = false;
    if (this.stopped) return;
    const base = this.options.relayUrl.replace(/^https:/, "wss:").replace(/^http:/, "ws:").replace(/\/$/, "");
    const socket = new WebSocket(`${base}/sessions/${encodeURIComponent(this.options.sessionId)}`);
    this.socket = socket;
    socket.onopen = () => socket.send(JSON.stringify({ type: "auth", token }));
    socket.onmessage = (event) => void this.receive(String(event.data));
    socket.onerror = () => this.options.onStatus("error", "Secure connection failed.");
    socket.onclose = (event) => {
      if (this.socket === socket) this.socket = null;
      if (this.stopped) return;
      if (event.code === 4003) {
        this.stopped = true;
        this.options.onStatus("disconnected", event.reason || "Session ended by therapist.");
        return;
      }
      this.options.onStatus("reconnecting", event.reason || "Reconnecting secure session…");
      this.scheduleReconnect();
    };
  }

  private readonly resume = () => {
    if (this.stopped || this.socket?.readyState === WebSocket.OPEN || this.socket?.readyState === WebSocket.CONNECTING) return;
    if (this.retry !== null) window.clearTimeout(this.retry);
    this.retry = null;
    void this.open();
  };

  private readonly onVisibilityChange = () => {
    if (document.visibilityState === "visible") this.resume();
  };

  private scheduleReconnect() {
    if (this.stopped || this.retry !== null) return;
    const delay = Math.min(15_000, 750 * 2 ** Math.min(this.attempts++, 4));
    this.retry = window.setTimeout(() => {
      this.retry = null;
      void this.open();
    }, delay);
  }

  private async receive(raw: string) {
    let value: unknown;
    try { value = JSON.parse(raw); } catch { return; }
    if (value && typeof value === "object" && (value as { type?: unknown }).type === "ready") {
      this.attempts = 0;
      this.options.onStatus("connected");
      return;
    }
    if (value && typeof value === "object") {
      const systemType = (value as { type?: unknown }).type;
      if (systemType === "snapshot-required" || systemType === "snapshot-requested" || systemType === "resync-required") {
        if (this.options.role === "client") this.options.onSnapshotRequired();
        return;
      }
    }
    const message = parseLiveMessage(value);
    if (!message) return;
    if (message.type === "diff") {
      const payload = message.payload as { changes: unknown };
      if (!isEncrypted(payload.changes)) return;
      const changes = await this.decrypt(message, payload.changes);
      if (changes !== null) this.options.onDiff(changes);
      return;
    }
    if (message.type === "snapshot") {
      const payload = message.payload as { records: unknown[] };
      const encrypted = payload.records[0];
      if (!isEncrypted(encrypted)) return;
      const records = await this.decrypt(message, encrypted);
      if (Array.isArray(records)) this.options.onSnapshot(records);
      return;
    }
    if (message.type === "page-change") {
      const payload = message.payload as { pageId: string };
      this.options.onPageChange(payload.pageId);
      return;
    }
    if (message.type === "recording-consent") {
      const payload = message.payload as { granted: boolean };
      this.options.onRecordingConsent(payload.granted);
    }
  }

  private async send(type: "diff" | "snapshot" | "page-change" | "recording-consent" | "session-end", payload: LiveEnvelope["payload"]) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;
    const envelope: LiveEnvelope = { version: LIVE_PROTOCOL_VERSION, sessionId: this.options.sessionId, sender: this.options.role, sequence: ++this.sequence, type, payload } as LiveEnvelope;
    this.socket.send(JSON.stringify(envelope));
  }

  private encrypt(value: unknown, type: string) {
    return encryptLivePayload(this.options.key, value, `${this.options.sessionId}:${type}:${this.sequence + 1}`);
  }

  private decrypt(message: LiveEnvelope, value: EncryptedLivePayload) {
    return decryptLivePayload(this.options.key, value, `${message.sessionId}:${message.type}:${message.sequence}`);
  }
}

export type { Status as LiveConnectionStatus };
