import type { DrawingEvent } from "./types";

export const RECORDING_FORMAT = "mindcanvas.recording";
export const RECORDING_VERSION = 1;

/** Complete recorded session. Raw point/timing events are independent of engine history. */
export interface RecordingSession {
  format: typeof RECORDING_FORMAT;
  version: number;
  engine: { name: string; version: string };
  startedAt: string;
  durationMs: number;
  /** false when the recording was interrupted (autosave) and never stopped properly */
  complete: boolean;
  /** Engine records present when recording started (so replay starts from the same state) */
  initialRecords: unknown[];
  /** Optional for backwards compatibility with recordings created before page support. */
  initialPageId?: string;
  events: DrawingEvent[];
}

const KEY = "mooncanvas.lastRecording";

/** Browser-local only. Nothing is uploaded. */
export function saveSession(s: RecordingSession) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
    return true;
  } catch {
    return false;
  }
}

export function loadSession(): RecordingSession | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? parseSession(raw) : null;
  } catch {
    return null;
  }
}

export function parseSession(raw: string): RecordingSession | null {
  const s = JSON.parse(raw) as RecordingSession;
  if (s?.format !== RECORDING_FORMAT || !Array.isArray(s.events)) return null;
  return s;
}

export function formatTime(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  Object.assign(document.createElement("a"), { href: url, download: name }).click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
