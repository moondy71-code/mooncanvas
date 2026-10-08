import { validateRelayMessage } from "./relay-core";
import { validateSessionToken, type RelayRole } from "./token";
import { DurableObject } from "cloudflare:workers";

export interface Env {
  SESSION_RELAY: DurableObjectNamespace<SessionRelay>;
  /** Public Ed25519 JWK JSON. This is intentionally safe to place in Worker configuration. */
  RELAY_PUBLIC_JWK: string;
}

type SocketState = { sessionId: string; role: RelayRole; lastSequence: number | null; exp: number };
type PendingSocketState = { sessionId: string };

const close = (socket: WebSocket, code: number, reason: string) => socket.close(code, reason);
const system = (socket: WebSocket, type: string, extra: Record<string, unknown> = {}) => socket.send(JSON.stringify({ type, ...extra }));

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const match = /^\/sessions\/([A-Za-z0-9_-]{22,128})$/.exec(url.pathname);
    if (!match || request.headers.get("Upgrade")?.toLowerCase() !== "websocket") return new Response("Not found", { status: 404 });
    // Tokens are deliberately sent as the first WebSocket message, never in the URL or logs.
    return env.SESSION_RELAY.getByName(match[1]!).fetch(request);
  },
} satisfies ExportedHandler<Env>;

/** One ephemeral relay room per session. It never writes drawing or recording payloads to storage. */
export class SessionRelay extends DurableObject<Env> {

  fetch(request: Request): Response {
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") return new Response("WebSocket upgrade required", { status: 426 });
    const sessionId = new URL(request.url).pathname.split("/").pop();
    if (!sessionId || !/^[A-Za-z0-9_-]{22,128}$/.test(sessionId)) return new Response("Invalid session", { status: 400 });
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.serializeAttachment({ sessionId } satisfies PendingSocketState);
    this.ctx.acceptWebSocket(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(socket: WebSocket, input: string | ArrayBuffer) {
    if (typeof input !== "string") return close(socket, 1003, "Text messages required");
    if (input.length > 32 * 1024) return close(socket, 1009, "Message too large");
    const current = socket.deserializeAttachment() as SocketState | PendingSocketState | null;
    if (!current || !("role" in current)) return this.authenticate(socket, input, current?.sessionId);
    if (Math.floor(Date.now() / 1000) >= current.exp) return close(socket, 4001, "Session token expired");

    const result = validateRelayMessage(current.role, current.sessionId, input, current.lastSequence);
    if (result.status === "rejected") return close(socket, 1008, "Message not permitted");
    if (result.status === "replay") return system(socket, "duplicate-ignored");
    if (result.status === "gap") return system(socket, "resync-required", { expectedSequence: result.expectedSequence });

    socket.serializeAttachment({ ...current, lastSequence: result.nextSequence });
    if (result.message.type === "session-end") return this.terminate("Session ended by therapist");
    for (const peer of this.ctx.getWebSockets()) {
      if (peer !== socket && peer.deserializeAttachment()) peer.send(input);
    }
  }

  async webSocketClose(socket: WebSocket) {
    socket.close();
    await this.scheduleExpiry();
  }

  async alarm() {
    await this.scheduleExpiry();
  }

  private async authenticate(socket: WebSocket, input: string, sessionId: string | undefined) {
    let auth: { type?: unknown; token?: unknown };
    try {
      auth = JSON.parse(input) as { type?: unknown; token?: unknown };
    } catch {
      return close(socket, 1008, "Authentication required");
    }
    if (auth.type !== "auth" || typeof auth.token !== "string" || auth.token.length > 4096) return close(socket, 1008, "Authentication required");
    if (!sessionId) return close(socket, 1008, "Invalid session");
    let publicJwk: JsonWebKey;
    try {
      publicJwk = JSON.parse(this.env.RELAY_PUBLIC_JWK) as JsonWebKey;
    } catch {
      return close(socket, 1011, "Relay misconfigured");
    }
    const claims = await validateSessionToken(auth.token, publicJwk, sessionId);
    if (!claims) return close(socket, 1008, "Invalid or expired session token");

    for (const peer of this.ctx.getWebSockets()) {
      const peerState = peer.deserializeAttachment() as SocketState | null;
      if (peerState?.role === claims.role) close(peer, 4000, "Reconnected elsewhere");
    }
    const attachment: SocketState = { sessionId, role: claims.role, lastSequence: null, exp: claims.exp };
    socket.serializeAttachment(attachment);
    await this.scheduleExpiry();
    system(socket, "ready", { role: claims.role, expiresAt: claims.exp });
    // A reconnect deliberately obtains a fresh snapshot from the client rather than retaining artwork.
    if (claims.role === "client") system(socket, "snapshot-required");
    else this.notifyClient("snapshot-requested");
  }

  private notifyClient(type: string) {
    for (const peer of this.ctx.getWebSockets()) {
      const peerState = peer.deserializeAttachment() as SocketState | null;
      if (peerState?.role === "client") system(peer, type);
    }
  }

  private async terminate(reason: string) {
    for (const peer of this.ctx.getWebSockets()) close(peer, 4003, reason);
    await this.ctx.storage.deleteAll();
  }

  /** Stores only an expiration alarm; drawing and recording messages are never written to Durable Object storage. */
  private async scheduleExpiry() {
    const now = Math.floor(Date.now() / 1000);
    let nextExpiry: number | null = null;
    for (const peer of this.ctx.getWebSockets()) {
      const peerState = peer.deserializeAttachment() as SocketState | PendingSocketState | null;
      if (peerState && "exp" in peerState) {
        if (peerState.exp <= now) close(peer, 4001, "Session token expired");
        else nextExpiry = nextExpiry === null ? peerState.exp : Math.min(nextExpiry, peerState.exp);
      }
    }
    if (nextExpiry !== null) await this.ctx.storage.setAlarm(nextExpiry * 1000);
  }
}
