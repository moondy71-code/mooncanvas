import type { Editor } from "tldraw";
import { createMemorySink } from "@/features/recording/types";
import { RECORDING_FORMAT, RECORDING_VERSION, type RecordingSession } from "@/features/recording/session";
import { attachTldrawRecorder } from "./tldrawRecorder";
import { isContentRecord } from "./records";

export { isContentRecord } from "./records";

export interface RecordingHandle {
  snapshot(): RecordingSession;
  stop(): RecordingSession;
}

/** Starts recording a tldraw editor. Autosaves periodically so interruptions lose at most a few seconds. */
export function startTldrawRecording(editor: Editor, autosave: (s: RecordingSession) => void, source: "user" | "all" = "user"): RecordingHandle {
  const t0 = performance.now();
  const startedAt = new Date().toISOString();
  const initialRecords = editor.store.allRecords().filter(isContentRecord);
  const initialPageId = editor.getCurrentPageId();
  const sink = createMemorySink();
  const detach = attachTldrawRecorder(editor, sink, t0, source);
  const build = (complete: boolean): RecordingSession => ({
    format: RECORDING_FORMAT,
    version: RECORDING_VERSION,
    engine: { name: "tldraw", version: "5.5.0" },
    startedAt,
    durationMs: Math.round(performance.now() - t0),
    complete,
    initialRecords,
    initialPageId,
    events: [...sink.events],
  });
  const timer = window.setInterval(() => autosave(build(false)), 2000);
  let done: RecordingSession | null = null;
  return {
    snapshot: () => done ?? build(false),
    stop: () => {
      if (done) return done;
      window.clearInterval(timer);
      detach();
      done = build(true);
      return done;
    },
  };
}
