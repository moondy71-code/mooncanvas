import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Editor } from "tldraw";
import { Logo } from "@/components/Logo";
import { OfflineStatus } from "@/components/OfflineStatus";
import { DrawingSurface } from "@/features/drawing/DrawingSurface";
import type { RecordingHandle } from "@/features/drawing/recordingController";
import { formatTime, saveSession } from "@/features/recording/session";

export const Route = createFileRoute("/draw")({
  head: () => ({
    meta: [
      { title: "Draw — MoonCanvas" },
      {
        name: "description",
        content: "Draw freely on a clean white canvas with pens, colours and an optional A4 guide.",
      },
      { property: "og:title", content: "Draw — MoonCanvas" },
      {
        property: "og:description",
        content: "Draw freely on a clean white canvas with pens, colours and an optional A4 guide.",
      },
    ],
  }),
  component: DrawPage,
});

function DrawPage() {
  const navigate = useNavigate();
  const [showA4, setShowA4] = useState(false);
  const [editor, setEditor] = useState<Editor | null>(null);
  const handle = useRef<RecordingHandle | null>(null);
  const [recStart, setRecStart] = useState<number | null>(null);
  const [now, setNow] = useState(0);

  const start = async () => {
    if (!editor) return;
    const { startTldrawRecording } = await import("@/features/drawing/recordingController");
    handle.current = startTldrawRecording(editor, saveSession);
    setRecStart(performance.now());
  };
  const stop = useCallback(() => {
    if (!handle.current) return;
    saveSession(handle.current.stop());
    handle.current = null;
    setRecStart(null);
  }, []);

  // Elapsed timer
  useEffect(() => {
    if (recStart === null) return;
    const id = setInterval(() => setNow(performance.now()), 250);
    return () => clearInterval(id);
  }, [recStart]);

  // Interruption safety: warn on tab close, save on in-app navigation away
  useEffect(() => {
    const onUnload = (e: BeforeUnloadEvent) => {
      if (!handle.current) return;
      saveSession(handle.current.snapshot());
      e.preventDefault();
    };
    window.addEventListener("beforeunload", onUnload);
    return () => {
      window.removeEventListener("beforeunload", onUnload);
      if (handle.current) saveSession(handle.current.stop());
    };
  }, []);

  const recording = recStart !== null;
  const pill = "min-h-11 rounded-full px-4 text-sm font-semibold transition-colors";

  return (
    <div className="flex h-dvh flex-col bg-soft">
      <header className="flex min-h-14 shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border bg-card/90 px-3 py-1.5 backdrop-blur sm:px-5">
        <Link to="/" className="flex items-center gap-2">
          <Logo size={32} />
          <span className="hidden font-display text-xl text-foreground sm:inline">MoonCanvas</span>
        </Link>
        <div className="flex items-center gap-2">
          <OfflineStatus />
          {recording && (
            <span
              className="flex items-center gap-1.5 text-sm font-semibold text-destructive"
              role="status"
            >
              <span className="size-2.5 animate-pulse rounded-full bg-destructive" />
              REC {formatTime(now - recStart)}
            </span>
          )}
          {recording ? (
            <button onClick={stop} className={`${pill} bg-destructive text-destructive-foreground`}>
              Stop<span className="hidden sm:inline"> Recording</span>
            </button>
          ) : (
            <button
              onClick={start}
              disabled={!editor}
              className="inline-flex size-10 items-center justify-center rounded-full bg-destructive text-destructive-foreground shadow-soft disabled:opacity-40"
              aria-label="Start recording"
              title="Start recording"
            >
              <span className="size-3 rounded-full bg-white" aria-hidden="true" />
            </button>
          )}
          <button
            onClick={() => navigate({ to: "/playback" })}
            disabled={recording}
            className="inline-flex size-10 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-soft disabled:opacity-40"
            aria-label="Open playback"
            title="Open playback"
          >
            <svg viewBox="0 0 20 20" className="size-5" aria-hidden="true">
              <path d="M6 4.5v11l9-5.5-9-5.5Z" fill="currentColor" />
            </svg>
          </button>
          <button
            onClick={() => setShowA4((v) => !v)}
            aria-pressed={showA4}
            className={`${pill} ${showA4 ? "bg-primary text-primary-foreground" : "bg-card text-foreground shadow-soft"}`}
          >
            A4<span className="hidden sm:inline"> guide</span>
          </button>
        </div>
      </header>
      <div
        className={`moon-canvas-frame relative mx-2 mb-2 flex-1 overflow-hidden rounded-3xl bg-card shadow-soft sm:mx-4 sm:mb-4 ${
          recording ? "ring-2 ring-destructive" : ""
        }`}
      >
        <div className="absolute inset-0">
          <DrawingSurface showA4={showA4} onEditor={setEditor} />
        </div>
      </div>
    </div>
  );
}
