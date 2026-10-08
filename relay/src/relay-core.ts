import { canSendLiveMessage, parseLiveMessage, type LiveEnvelope } from "../../src/features/live/protocol";
import type { RelayRole } from "./token";

export type RelayMessageResult =
  | { status: "accepted"; message: LiveEnvelope; nextSequence: number }
  | { status: "replay" }
  | { status: "gap"; expectedSequence: number }
  | { status: "rejected" };

/** Validates role, session scope, and strict monotonic delivery for one socket. */
export function validateRelayMessage(role: RelayRole, sessionId: string, raw: string, previousSequence: number | null): RelayMessageResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { status: "rejected" };
  }
  const message = parseLiveMessage(parsed);
  if (!message || message.sessionId !== sessionId || !canSendLiveMessage(role, message)) return { status: "rejected" };
  if (previousSequence !== null && message.sequence <= previousSequence) return { status: "replay" };
  if (previousSequence !== null && message.sequence !== previousSequence + 1) return { status: "gap", expectedSequence: previousSequence + 1 };
  return { status: "accepted", message, nextSequence: message.sequence };
}

/** Exactly one active socket is permitted for each role; reconnects atomically replace stale sockets. */
export class ConnectionRegistry {
  private readonly active = new Map<RelayRole, string>();
  private ended = false;

  connect(role: RelayRole, connectionId: string): { accepted: boolean; replaced?: string } {
    if (this.ended) return { accepted: false };
    const replaced = this.active.get(role);
    this.active.set(role, connectionId);
    return replaced && replaced !== connectionId ? { accepted: true, replaced } : { accepted: true };
  }

  disconnect(role: RelayRole, connectionId: string) {
    if (this.active.get(role) === connectionId) this.active.delete(role);
  }

  terminate() {
    this.ended = true;
    this.active.clear();
  }

  isConnected(role: RelayRole) {
    return this.active.has(role);
  }
}
