import { lazy, Suspense, useEffect, useRef, useState } from "react";
import type { Editor, RecordsDiff, TLPageId, TLRecord } from "tldraw";
import { DrawingSurface } from "@/features/drawing/DrawingSurface";
import { isContentRecord } from "@/features/drawing/records";
import type { RecordingHandle } from "@/features/drawing/recordingController";
import { downloadBlob, formatTime, saveSession, type RecordingSession } from "@/features/recording/session";
import { importSessionEncryptionKey } from "./crypto";
import { LiveTransport, type LiveConnectionStatus } from "./liveTransport";
import {
  clearLiveSession,
  getLiveSessionValue,
  loadLiveDrawingSnapshot,
  loadLiveRecordings,
  putLiveSessionValue,
  saveLiveDrawingSnapshot,
  saveLiveRecordings,
} from "./sessionPersistence";
import { useScreenWakeLock } from "./useScreenWakeLock";

const PlaybackView = lazy(() => import("@/features/drawing/PlaybackView"));

type Props = { sessionId: string; role: "therapist" | "client"; onFatal: (message: string) => void };
function contentRecords(editor: Editor) { return editor.store.allRecords().filter(isContentRecord); }

function saveDrawingSnapshot(editor: Editor, sessionId: string) {
  saveLiveDrawingSnapshot(sessionId, contentRecords(editor));
}

function restoreDrawingSnapshot(editor: Editor, sessionId: string) {
  const records = loadLiveDrawingSnapshot(sessionId);
  if (records) applySnapshot(editor, records);
}

function applyDiff(editor: Editor, value: unknown) {
  const diff = value as RecordsDiff<TLRecord>;
  if (!diff || typeof diff !== "object" || !diff.added || !diff.updated || !diff.removed) return;
  const put = [...Object.values(diff.added), ...Object.values(diff.updated).map((pair) => pair[1])].filter(isContentRecord);
  const removed = Object.keys(diff.removed)
    .filter((id) => id.startsWith("shape:") || id.startsWith("binding:") || (id.startsWith("page:") && id !== editor.getCurrentPageId())) as TLRecord["id"][];
  editor.store.mergeRemoteChanges(() => {
    if (put.length) editor.store.put(put);
    if (removed.length) editor.store.remove(removed);
  });
}

function applySnapshot(editor: Editor, records: unknown[]) {
  const content = records.filter((record): record is TLRecord => !!record && typeof record === "object" && isContentRecord(record as TLRecord));
  editor.store.mergeRemoteChanges(() => {
    // Keep the local current page until its replacement is present. This avoids
    // an invalid current-page pointer while applying a multi-page snapshot.
    const existing = editor.store.allRecords()
      .filter(isContentRecord)
      .filter((record) => record.typeName !== "page" || record.id !== editor.getCurrentPageId())
      .map((record) => record.id);
    if (existing.length) editor.store.remove(existing);
    if (content.length) editor.store.put(content);
  });
}

type PageSummary = { id: string; name: string; index: string };
function pageSummaries(editor: Editor): PageSummary[] {
  return editor.getPages().map((page) => ({ id: page.id, name: page.name, index: page.index }));
}

export function LiveDrawingSession({ sessionId, role, onFatal }: Props) {
  const [editor, setEditor] = useState<Editor | null>(null);
  const [status, setStatus] = useState<LiveConnectionStatus>("connecting");
  const [detail, setDetail] = useState("");
  const [ending, setEnding] = useState(false);
  const [clientRecordingConsent, setClientRecordingConsent] = useState(false);
  const [therapistHasConsent, setTherapistHasConsent] = useState(false);
  const [recordingStartedAt, setRecordingStartedAt] = useState<number | null>(null);
  const [recordingNow, setRecordingNow] = useState(0);
  const [completedRecordings, setCompletedRecordings] = useState<RecordingSession[]>(() => loadLiveRecordings(sessionId));
  const [playbackSession, setPlaybackSession] = useState<RecordingSession | null>(null);
  const [pages, setPages] = useState<PageSummary[]>([]);
  const [visiblePageId, setVisiblePageId] = useState<string | null>(null);
  const transport = useRef<LiveTransport | null>(null);
  const recording = useRef<RecordingHandle | null>(null);
  const clientConsentRef = useRef(false);
  const centerTimer = useRef<number | null>(null);
  const requestedClientPage = useRef<string | null>(null);
  const wakeLockAvailable = useScreenWakeLock(!ending);

  const centerDrawing = (target: Editor, animated = true) => {
    const bounds = target.getCurrentPageBounds();
    if (!bounds || (bounds.w === 0 && bounds.h === 0)) return;
    target.centerOnPoint(bounds.center, animated ? { animation: { duration: 180 } } : undefined);
  };

  const scheduleTherapistCenter = (target: Editor) => {
    if (role !== "therapist") return;
    if (centerTimer.current !== null) window.clearTimeout(centerTimer.current);
    // Coalesce a stroke's many record updates into one gentle camera movement.
    centerTimer.current = window.setTimeout(() => centerDrawing(target), 150);
  };

  const syncPages = (target: Editor) => {
    const requested = requestedClientPage.current;
    if (requested && target.getPage(requested as TLPageId)) {
      target.setCurrentPage(requested as TLPageId);
      requestedClientPage.current = null;
    }
    setPages(pageSummaries(target));
    setVisiblePageId(String(target.getCurrentPageId()));
  };

  const stopRecording = () => {
    if (!recording.current) return;
    const completed = recording.current.stop();
    saveSession(completed);
    recording.current = null;
    setCompletedRecordings((recordings) => {
      const next = [completed, ...recordings];
      saveLiveRecordings(sessionId, next);
      return next;
    });
    setRecordingStartedAt(null);
  };

  const startRecording = async () => {
    if (role !== "therapist" || !editor || !therapistHasConsent || recording.current) return;
    const { startTldrawRecording } = await import("@/features/drawing/recordingController");
    if (recording.current) return;
    recording.current = startTldrawRecording(editor, saveSession, "all");
    setRecordingStartedAt(performance.now());
  };

  useEffect(() => {
    if (recordingStartedAt === null) return;
    const timer = window.setInterval(() => setRecordingNow(performance.now()), 250);
    return () => window.clearInterval(timer);
  }, [recordingStartedAt]);

  // This cache is browser-local and exists only while the live session tab is
  // open. It makes a short reconnect or an inline playback view non-destructive;
  // an authoritative client snapshot still replaces it after reconnection.
  useEffect(() => {
    if (!editor) return;
    restoreDrawingSnapshot(editor, sessionId);
    syncPages(editor);
  }, [editor, sessionId]);

  useEffect(() => {
    if (!editor) return;
    const encodedKey = getLiveSessionValue(sessionId, "key");
    const refreshName = role === "therapist" ? "therapist-refresh" : "client-refresh";
    const relayUrl = import.meta.env["VITE_MINDCANVAS_RELAY_URL"] as string | undefined;
    if (!encodedKey || !relayUrl) { onFatal(!relayUrl ? "Secure relay is not configured." : "This browser no longer holds the session encryption key."); return; }
    let active = true;
    let stopStore: (() => void) | undefined;
    void importSessionEncryptionKey(encodedKey).then((key) => {
      if (!active || !key) return onFatal("This browser has an invalid session encryption key.");
      const refresh = async () => {
        const refreshSecret = getLiveSessionValue(sessionId, refreshName);
        if (!refreshSecret) throw new Error("missing refresh secret");
        const response = await fetch(`/api/mindcanvas/sessions/${sessionId}/refresh`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ role, refreshSecret }) });
        if (!response.ok) {
          if (response.status === 401 || response.status === 410) clearLiveSession(sessionId);
          throw Object.assign(new Error(response.status === 401 || response.status === 410 ? "This session has ended or expired." : "Could not refresh the secure connection."), { fatal: response.status === 401 || response.status === 410 });
        }
        const result = await response.json() as { token: string; refreshSecret: string };
        putLiveSessionValue(sessionId, refreshName, result.refreshSecret);
        return result.token;
      };
      const connection = new LiveTransport({
        relayUrl, sessionId, role, key, getToken: refresh,
        onStatus: (next, nextDetail) => {
          if (active) {
            setStatus(next);
            setDetail(nextDetail ?? "");
            if (next === "connected" && role === "client") {
              if (clientConsentRef.current) void connection.sendRecordingConsent(true);
              void connection.sendPageChange(String(editor.getCurrentPageId()));
            }
          }
        },
        onDiff: (changes) => { applyDiff(editor, changes); syncPages(editor); saveDrawingSnapshot(editor, sessionId); scheduleTherapistCenter(editor); },
        onSnapshot: (records) => { applySnapshot(editor, records); syncPages(editor); saveDrawingSnapshot(editor, sessionId); scheduleTherapistCenter(editor); },
        onSnapshotRequired: () => {
          if (role === "client") {
            void connection.sendSnapshot(contentRecords(editor)).then(() => connection.sendPageChange(String(editor.getCurrentPageId())));
          }
        },
        onPageChange: (pageId) => {
          if (role !== "therapist") return;
          requestedClientPage.current = pageId;
          syncPages(editor);
          scheduleTherapistCenter(editor);
        },
        onRecordingConsent: (granted) => {
          if (role !== "therapist") return;
          setTherapistHasConsent(granted);
          if (!granted) stopRecording();
        },
      });
      transport.current = connection;
      if (role === "client") {
        stopStore = editor.store.listen((entry) => {
          const changes = entry.changes as RecordsDiff<TLRecord>;
          const added = Object.fromEntries(Object.entries(changes.added).filter(([, record]) => isContentRecord(record)));
          const updated = Object.fromEntries(Object.entries(changes.updated).filter(([, pair]) => isContentRecord(pair[1])));
          const removed = Object.fromEntries(Object.entries(changes.removed).filter(([id]) => id.startsWith("shape:") || id.startsWith("binding:") || id.startsWith("page:")));
          if (Object.keys(added).length || Object.keys(updated).length || Object.keys(removed).length) void connection.sendDiff({ added, updated, removed });
          if (Object.keys(added).length || Object.keys(updated).length || Object.keys(removed).length) saveDrawingSnapshot(editor, sessionId);
        }, { source: "user", scope: "document" });
        const stopPageChanges = editor.store.listen((entry) => {
          const changedPage = Object.values(entry.changes.updated).some(([from, to]) =>
            to.typeName === "instance" && from.typeName === "instance" && from.currentPageId !== to.currentPageId,
          );
          if (changedPage) void connection.sendPageChange(String(editor.getCurrentPageId()));
        }, { source: "user", scope: "all" });
        const stopDocumentPages = editor.store.listen(() => syncPages(editor), { source: "user", scope: "document" });
        const previousStopStore = stopStore;
        stopStore = () => { previousStopStore?.(); stopPageChanges(); stopDocumentPages(); };
      }
      connection.start();
    });
    return () => {
      active = false;
      stopStore?.();
      if (recording.current) stopRecording();
      if (centerTimer.current !== null) window.clearTimeout(centerTimer.current);
      centerTimer.current = null;
      transport.current?.stop();
      transport.current = null;
    };
  }, [editor, onFatal, role, sessionId]);

  const end = async () => {
    if (role !== "therapist" || ending) return;
    setEnding(true);
    stopRecording();
    await transport.current?.endSession();
    const refreshSecret = getLiveSessionValue(sessionId, "therapist-refresh");
    if (!refreshSecret) return onFatal("This browser no longer holds the therapist session secret.");
    const response = await fetch(`/api/mindcanvas/sessions/${sessionId}/end`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ refreshSecret }) });
    if (!response.ok) return onFatal("Could not end the session.");
    clearLiveSession(sessionId);
    transport.current?.stop();
    setDetail("Session ended.");
  };

  const updateClientConsent = (granted: boolean) => {
    clientConsentRef.current = granted;
    setClientRecordingConsent(granted);
    void transport.current?.sendRecordingConsent(granted);
  };

  const latestRecording = completedRecordings[0] ?? null;
  const downloadRecording = (recordingToDownload = latestRecording) => {
    if (!recordingToDownload) return;
    downloadBlob(
      new Blob([JSON.stringify(recordingToDownload, null, 2)], { type: "application/json" }),
      `mindcanvas-session-recording-${recordingToDownload.startedAt.slice(0, 19).replace(/[:T]/g, "-")}.json`,
    );
  };

  const recordingActive = recordingStartedAt !== null;
  const currentPageIndex = pages.findIndex((page) => page.id === visiblePageId);
  const navigatePage = (offset: number) => {
    if (!editor || role !== "therapist") return;
    const next = pages[currentPageIndex + offset];
    if (!next) return;
    editor.setCurrentPage(next.id as TLPageId);
    syncPages(editor);
    centerDrawing(editor, false);
  };

  return <div className="flex h-dvh flex-col bg-soft"><header className="flex min-h-14 shrink-0 flex-wrap items-center justify-between gap-3 px-4 py-2"><div><h1 className="font-display text-xl text-foreground">{role === "therapist" ? "Live session observer" : "Live drawing session"}</h1><p className="text-xs text-muted-foreground">{role === "therapist" ? (therapistHasConsent ? "Client consent received — read-only view" : "Read-only view — waiting for recording consent") : "Only you can modify this drawing"}{wakeLockAvailable ? " · Screen stays awake while this session is open" : ""}</p></div><div className="flex flex-wrap items-center gap-2"><p className="text-sm text-muted-foreground" role="status">{status}{detail ? ` — ${detail}` : ""}</p>{role === "client" && <label className="flex min-h-10 items-center gap-2 rounded-full bg-card px-3 text-xs text-foreground shadow-soft"><input type="checkbox" checked={clientRecordingConsent} onChange={(event) => updateClientConsent(event.target.checked)} />I consent to local recording</label>}{role === "therapist" && pages.length > 1 && <div className="flex min-h-10 items-center gap-1 rounded-full bg-card px-1 shadow-soft" aria-label="Session pages"><button onClick={() => navigatePage(-1)} disabled={currentPageIndex <= 0} className="min-h-8 rounded-full px-2 text-sm disabled:opacity-40" aria-label="Previous page">‹</button><span className="max-w-28 truncate px-1 text-xs text-foreground">{pages[currentPageIndex]?.name ?? "Page"}</span><button onClick={() => navigatePage(1)} disabled={currentPageIndex < 0 || currentPageIndex >= pages.length - 1} className="min-h-8 rounded-full px-2 text-sm disabled:opacity-40" aria-label="Next page">›</button></div>}{role === "therapist" && <button onClick={() => editor && centerDrawing(editor, false)} disabled={!editor} className="min-h-10 rounded-full bg-card px-4 text-sm font-semibold text-foreground shadow-soft disabled:opacity-50">Center drawing</button>}{role === "therapist" && (recordingActive ? <><span className="flex items-center gap-1.5 text-sm font-semibold text-destructive" role="status"><span className="size-2.5 animate-pulse rounded-full bg-destructive" />REC {formatTime(recordingNow - recordingStartedAt!)}</span><button onClick={stopRecording} className="min-h-10 rounded-full bg-destructive px-4 text-sm font-semibold text-destructive-foreground">Stop</button></> : <button onClick={() => void startRecording()} disabled={!editor || !therapistHasConsent} className="inline-flex size-10 items-center justify-center rounded-full bg-destructive text-destructive-foreground shadow-soft disabled:opacity-50" aria-label="Start recording" title="Start recording"><span className="size-3 rounded-full bg-white" aria-hidden="true" /></button>)}{role === "therapist" && latestRecording && <button onClick={() => setPlaybackSession(latestRecording)} className="inline-flex size-10 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-soft" aria-label="Play recording" title="Play recording"><svg viewBox="0 0 20 20" className="size-5" aria-hidden="true"><path d="M6 4.5v11l9-5.5-9-5.5Z" fill="currentColor" /></svg></button>}{role === "therapist" && latestRecording && <button onClick={() => downloadRecording()} className="min-h-10 rounded-full bg-card px-4 text-sm font-semibold text-foreground shadow-soft">Download recording</button>}{role === "therapist" && <button onClick={() => void end()} disabled={ending} className="min-h-10 rounded-full bg-destructive px-4 text-sm font-semibold text-destructive-foreground disabled:opacity-50">End session</button>}</div></header><div className="relative mx-2 mb-2 min-h-0 flex-1 overflow-hidden rounded-3xl bg-card shadow-soft sm:mx-4 sm:mb-4"><div className="absolute inset-0"><DrawingSurface showA4={false} readOnly={role === "therapist"} onEditor={setEditor} /></div>{playbackSession && <div className="absolute inset-0 z-20 bg-background/95 p-2 sm:p-4"><Suspense fallback={<div className="flex h-full items-center justify-center text-muted-foreground">Loading recording…</div>}><PlaybackView session={playbackSession} onClose={() => setPlaybackSession(null)} /></Suspense></div>}</div></div>;
}
