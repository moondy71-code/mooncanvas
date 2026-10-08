import { RECORDING_FORMAT, RECORDING_VERSION, type RecordingSession } from "@/features/recording/session";
import type { DrawingEvent } from "@/features/recording/types";

/** Versioned, transport-neutral messages for a single live MindCanvas session. */
export const LIVE_PROTOCOL_VERSION = 1;
export const MAX_LIVE_MESSAGE_BYTES = 32 * 1024;
export const MAX_RECORDING_CHUNKS = 10_000;

export type LiveRole = "therapist" | "client";
export type LiveMessageType =
  | "diff"
  | "snapshot-request"
  | "snapshot"
  | "page-change"
  | "recording-consent"
  | "recording-start"
  | "recording-chunk"
  | "recording-complete"
  | "recording-ack"
  | "session-end";

export interface LiveEnvelope<T extends LiveMessageType = LiveMessageType> {
  version: typeof LIVE_PROTOCOL_VERSION;
  sessionId: string;
  sender: LiveRole;
  sequence: number;
  type: T;
  payload: LivePayloadByType[T];
}

export interface RecordingTransferStart {
  transferId: string;
  startedAt: string;
  engine: RecordingSession["engine"];
  initialRecords: unknown[];
}

export type LivePayloadByType = {
  diff: { changes: unknown };
  "snapshot-request": { afterSequence: number };
  snapshot: { records: unknown[]; lastSequence: number };
  "page-change": { pageId: string };
  "recording-consent": { granted: boolean; at: string };
  "recording-start": RecordingTransferStart;
  "recording-chunk": { transferId: string; index: number; events: DrawingEvent[] };
  "recording-complete": { transferId: string; totalChunks: number; durationMs: number; complete: boolean };
  "recording-ack": { transferId: string; received: number[] };
  "session-end": { at: string };
};

const rolesForType: Record<LiveMessageType, readonly LiveRole[]> = {
  diff: ["client"],
  "snapshot-request": ["therapist"],
  snapshot: ["client"],
  "page-change": ["client"],
  "recording-consent": ["client"],
  "recording-start": ["client"],
  "recording-chunk": ["client"],
  "recording-complete": ["client"],
  "recording-ack": ["therapist"],
  "session-end": ["therapist"],
};

const isObject = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const isNonEmptyString = (value: unknown, max = 200): value is string => typeof value === "string" && value.length > 0 && value.length <= max;
const isInteger = (value: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;

function isJsonValue(value: unknown, depth = 0): boolean {
  if (depth > 30 || value === null || typeof value === "string" || typeof value === "boolean") return depth <= 30;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every((entry) => isJsonValue(entry, depth + 1));
  return isObject(value) && Object.values(value).every((entry) => isJsonValue(entry, depth + 1));
}

function isDrawingEvent(value: unknown): value is DrawingEvent {
  return isObject(value) && isNonEmptyString(value["type"], 40) && isJsonValue(value);
}

function validPayload(type: LiveMessageType, payload: unknown): boolean {
  if (!isObject(payload)) return false;
  switch (type) {
    case "diff":
      return "changes" in payload && isJsonValue(payload["changes"]);
    case "snapshot-request":
      return isInteger(payload["afterSequence"]);
    case "snapshot":
      return Array.isArray(payload["records"]) && payload["records"].every(isJsonValue) && isInteger(payload["lastSequence"]);
    case "page-change":
      return isNonEmptyString(payload["pageId"], 200);
    case "recording-consent":
      return typeof payload["granted"] === "boolean" && isNonEmptyString(payload["at"], 64);
    case "recording-start":
      return (
        isNonEmptyString(payload["transferId"]) &&
        isNonEmptyString(payload["startedAt"], 64) &&
        isObject(payload["engine"]) &&
        isNonEmptyString(payload["engine"]["name"]) &&
        isNonEmptyString(payload["engine"]["version"]) &&
        Array.isArray(payload["initialRecords"]) &&
        payload["initialRecords"].every(isJsonValue)
      );
    case "recording-chunk":
      return isNonEmptyString(payload["transferId"]) && isInteger(payload["index"], 0, MAX_RECORDING_CHUNKS - 1) && Array.isArray(payload["events"]) && payload["events"].every(isDrawingEvent);
    case "recording-complete":
      return isNonEmptyString(payload["transferId"]) && isInteger(payload["totalChunks"], 0, MAX_RECORDING_CHUNKS) && isInteger(payload["durationMs"]) && typeof payload["complete"] === "boolean";
    case "recording-ack":
      return isNonEmptyString(payload["transferId"]) && Array.isArray(payload["received"]) && payload["received"].every((index) => isInteger(index, 0, MAX_RECORDING_CHUNKS - 1));
    case "session-end":
      return isNonEmptyString(payload["at"], 64);
  }
}

/** Parses only bounded JSON-safe messages. Network adapters must call this before acting on a payload. */
export function parseLiveMessage(value: unknown): LiveEnvelope | null {
  if (!isObject(value)) return null;
  const { version, sessionId, sender, sequence, type, payload } = value;
  if (
    version !== LIVE_PROTOCOL_VERSION ||
    !isNonEmptyString(sessionId, 128) ||
    (sender !== "therapist" && sender !== "client") ||
    !isInteger(sequence) ||
    !isNonEmptyString(type, 40) ||
    !(type in rolesForType) ||
    !validPayload(type as LiveMessageType, payload)
  ) {
    return null;
  }
  try {
    if (new TextEncoder().encode(JSON.stringify(value)).byteLength > MAX_LIVE_MESSAGE_BYTES) return null;
  } catch {
    return null;
  }
  return value as unknown as LiveEnvelope;
}

export function canSendLiveMessage(role: LiveRole, message: LiveEnvelope): boolean {
  return message.sender === role && rolesForType[message.type].includes(role);
}

/** Tracks delivery order per sender. A gap requests a snapshot; replays are discarded. */
export class SequenceGate {
  private readonly last = new Map<LiveRole, number>();

  accept(message: LiveEnvelope): "accepted" | "replay" | "gap" {
    const previous = this.last.get(message.sender);
    if (previous === undefined) {
      this.last.set(message.sender, message.sequence);
      return "accepted";
    }
    if (message.sequence <= previous) return "replay";
    this.last.set(message.sender, message.sequence);
    return message.sequence === previous + 1 ? "accepted" : "gap";
  }
}

/** Reassembles one exact recording JSON v1 transfer despite duplicate or out-of-order chunks. */
export class RecordingTransferAssembler {
  private readonly chunks = new Map<number, DrawingEvent[]>();
  private completed: LivePayloadByType["recording-complete"] | null = null;

  constructor(private readonly start: RecordingTransferStart) {}

  addChunk(chunk: LivePayloadByType["recording-chunk"]): "added" | "duplicate" | "conflict" | "invalid" {
    if (chunk.transferId !== this.start.transferId || !validPayload("recording-chunk", chunk)) return "invalid";
    const existing = this.chunks.get(chunk.index);
    if (!existing) {
      this.chunks.set(chunk.index, chunk.events);
      return "added";
    }
    return JSON.stringify(existing) === JSON.stringify(chunk.events) ? "duplicate" : "conflict";
  }

  setComplete(complete: LivePayloadByType["recording-complete"]): boolean {
    if (complete.transferId !== this.start.transferId || !validPayload("recording-complete", complete)) return false;
    if (this.completed && JSON.stringify(this.completed) !== JSON.stringify(complete)) return false;
    this.completed = complete;
    return true;
  }

  missing(): number[] {
    if (!this.completed) return [];
    return Array.from({ length: this.completed.totalChunks }, (_, index) => index).filter((index) => !this.chunks.has(index));
  }

  build(): RecordingSession | null {
    if (!this.completed || this.missing().length) return null;
    const events = Array.from({ length: this.completed.totalChunks }, (_, index) => this.chunks.get(index)!).flat();
    return {
      format: RECORDING_FORMAT,
      version: RECORDING_VERSION,
      engine: this.start.engine,
      startedAt: this.start.startedAt,
      durationMs: this.completed.durationMs,
      complete: this.completed.complete,
      initialRecords: this.start.initialRecords,
      events,
    };
  }
}
