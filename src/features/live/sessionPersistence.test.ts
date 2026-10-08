import { afterEach, describe, expect, it } from "vitest";
import {
  clearLiveSession,
  getLiveSessionResume,
  getLiveSessionTabValue,
  getLiveSessionValue,
  loadLiveDrawingSnapshot,
  loadLiveRecordings,
  putLiveSessionValue,
  rememberLiveSession,
  saveLiveDrawingSnapshot,
  saveLiveRecordings,
} from "./sessionPersistence";

const id = "a".repeat(32);
const expiresAt = new Date(Date.now() + 60_000).toISOString();

afterEach(() => {
  clearLiveSession(id);
  sessionStorage.clear();
  localStorage.clear();
});

describe("live session persistence", () => {
  it("restores active session material after the tab-scoped copy is gone", () => {
    rememberLiveSession(id, { role: "client", expiresAt });
    putLiveSessionValue(id, "key", "key-material");
    putLiveSessionValue(id, "client-refresh", "refresh-material");
    sessionStorage.clear();

    expect(getLiveSessionResume(id)).toMatchObject({ role: "client", expiresAt });
    expect(getLiveSessionValue(id, "key")).toBe("key-material");
    expect(getLiveSessionValue(id, "client-refresh")).toBe("refresh-material");
  });

  it("keeps a pre-recovery session usable in its original browser tab", () => {
    sessionStorage.setItem(`mindcanvas.live.${id}.key`, "legacy-key");
    expect(getLiveSessionValue(id, "key")).toBe("legacy-key");
    expect(localStorage.getItem(`mindcanvas.live.${id}.key`)).toBeNull();
  });

  it("does not revive therapist authority after a fully closed app", () => {
    rememberLiveSession(id, { role: "therapist", expiresAt });
    putLiveSessionValue(id, "key", "key-material");
    putLiveSessionValue(id, "therapist-refresh", "refresh-material");
    sessionStorage.clear();

    expect(getLiveSessionValue(id, "key")).toBe("key-material");
    expect(getLiveSessionTabValue(id, "key")).toBeNull();
    expect(getLiveSessionTabValue(id, "therapist-refresh")).toBeNull();
  });

  it("keeps only active-session artwork and recordings until session end", () => {
    rememberLiveSession(id, { role: "therapist", expiresAt });
    saveLiveDrawingSnapshot(id, [{ id: "shape:one" }]);
    saveLiveRecordings(id, [{ format: "mindcanvas.recording", version: 1, engine: { name: "tldraw", version: "5" }, startedAt: expiresAt, durationMs: 1, complete: true, initialRecords: [], events: [] }]);

    expect(loadLiveDrawingSnapshot(id)).toEqual([{ id: "shape:one" }]);
    expect(loadLiveRecordings(id)).toHaveLength(1);
    clearLiveSession(id);
    expect(loadLiveDrawingSnapshot(id)).toBeNull();
    expect(loadLiveRecordings(id)).toEqual([]);
  });

  it("rejects and clears expired local session material", () => {
    rememberLiveSession(id, { role: "client", expiresAt: new Date(Date.now() - 1).toISOString() });
    putLiveSessionValue(id, "key", "key-material");

    expect(getLiveSessionResume(id)).toBeNull();
    expect(getLiveSessionValue(id, "key")).toBeNull();
  });
});
