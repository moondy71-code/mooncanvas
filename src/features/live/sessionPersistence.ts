import type { RecordingSession } from "@/features/recording/session";

type SessionRole = "therapist" | "client";
type SessionResume = {
  expiresAt: string;
  role: SessionRole;
  clientCapability?: string;
};

const prefix = (sessionId: string) => `mindcanvas.live.${sessionId}`;
const keyFor = (sessionId: string, name: string) => `${prefix(sessionId)}.${name}`;
const resumeKey = (sessionId: string) => keyFor(sessionId, "resume");
const namesToClear = ["resume", "key", "therapist-refresh", "client-refresh", "drawing-snapshot", "recordings"];

function get(storage: Storage, key: string) {
  try { return storage.getItem(key); } catch { return null; }
}

function put(storage: Storage, key: string, value: string) {
  try { storage.setItem(key, value); } catch { /* Browser storage is best-effort. */ }
}

function remove(storage: Storage, key: string) {
  try { storage.removeItem(key); } catch { /* Browser storage is best-effort. */ }
}

function readResume(sessionId: string): SessionResume | null {
  const raw = get(sessionStorage, resumeKey(sessionId)) ?? get(localStorage, resumeKey(sessionId));
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<SessionResume>;
    if ((value.role !== "therapist" && value.role !== "client") || typeof value.expiresAt !== "string") return null;
    if (!Number.isFinite(new Date(value.expiresAt).getTime())) return null;
    return value as SessionResume;
  } catch {
    return null;
  }
}

/**
 * Stores only active-session material in this browser. The copy in localStorage
 * deliberately survives a mobile browser discarding its tab; it is removed on
 * therapist end and whenever the server-side session expiry is observed.
 */
export function rememberLiveSession(sessionId: string, resume: SessionResume) {
  const serialized = JSON.stringify(resume);
  put(sessionStorage, resumeKey(sessionId), serialized);
  put(localStorage, resumeKey(sessionId), serialized);
}

export function getLiveSessionResume(sessionId: string): SessionResume | null {
  const resume = readResume(sessionId);
  if (!resume) return null;
  if (new Date(resume.expiresAt).getTime() <= Date.now()) {
    clearLiveSession(sessionId);
    return null;
  }
  return resume;
}

export function putLiveSessionValue(sessionId: string, name: "key" | "therapist-refresh" | "client-refresh", value: string) {
  put(sessionStorage, keyFor(sessionId, name), value);
  put(localStorage, keyFor(sessionId, name), value);
}

export function getLiveSessionValue(sessionId: string, name: "key" | "therapist-refresh" | "client-refresh") {
  // Sessions created before persistent recovery was introduced still have their
  // secrets in this tab's sessionStorage. Keep that active tab working through
  // an application upgrade; those legacy values are never copied to localStorage.
  if (!getLiveSessionResume(sessionId)) return get(sessionStorage, keyFor(sessionId, name));
  return get(sessionStorage, keyFor(sessionId, name)) ?? get(localStorage, keyFor(sessionId, name));
}

/**
 * Therapist authority intentionally does not survive a fully closed app.
 * sessionStorage survives reloads and ordinary backgrounding, while a fresh
 * app launch does not revive the old therapist session from localStorage.
 */
export function getLiveSessionTabValue(sessionId: string, name: "key" | "therapist-refresh") {
  return get(sessionStorage, keyFor(sessionId, name));
}

export function saveLiveDrawingSnapshot(sessionId: string, records: unknown[]) {
  if (!getLiveSessionResume(sessionId)) return;
  const serialized = JSON.stringify(records);
  put(sessionStorage, keyFor(sessionId, "drawing-snapshot"), serialized);
  put(localStorage, keyFor(sessionId, "drawing-snapshot"), serialized);
}

export function loadLiveDrawingSnapshot(sessionId: string): unknown[] | null {
  if (!getLiveSessionResume(sessionId)) return null;
  const raw = get(sessionStorage, keyFor(sessionId, "drawing-snapshot")) ?? get(localStorage, keyFor(sessionId, "drawing-snapshot"));
  if (!raw) return null;
  try {
    const value = JSON.parse(raw);
    return Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

export function saveLiveRecordings(sessionId: string, recordings: RecordingSession[]) {
  if (!getLiveSessionResume(sessionId)) return;
  const serialized = JSON.stringify(recordings);
  put(sessionStorage, keyFor(sessionId, "recordings"), serialized);
  put(localStorage, keyFor(sessionId, "recordings"), serialized);
}

export function loadLiveRecordings(sessionId: string): RecordingSession[] {
  if (!getLiveSessionResume(sessionId)) return [];
  const raw = get(sessionStorage, keyFor(sessionId, "recordings")) ?? get(localStorage, keyFor(sessionId, "recordings"));
  if (!raw) return [];
  try {
    const value = JSON.parse(raw);
    return Array.isArray(value) ? value as RecordingSession[] : [];
  } catch {
    return [];
  }
}

export function clearLiveSession(sessionId: string) {
  for (const name of namesToClear) {
    remove(sessionStorage, keyFor(sessionId, name));
    remove(localStorage, keyFor(sessionId, name));
  }
}
