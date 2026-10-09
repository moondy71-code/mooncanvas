import { createFileRoute, Link } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useState } from "react";
import { Logo } from "@/components/Logo";
import { loadSession, parseSession, type RecordingSession } from "@/features/recording/session";

const PlaybackView = lazy(() => import("@/features/drawing/PlaybackView"));

export const Route = createFileRoute("/playback")({
  head: () => ({
    meta: [
      { title: "Playback — MoonCanvas" },
      { name: "description", content: "Replay a recorded drawing session stroke by stroke, at its original pace." },
      { property: "og:title", content: "Playback — MoonCanvas" },
      { property: "og:description", content: "Replay a recorded drawing session stroke by stroke, at its original pace." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PlaybackPage,
});

function PlaybackPage() {
  const [session, setSession] = useState<RecordingSession | null | undefined>(undefined);
  const [error, setError] = useState("");
  useEffect(() => setSession(loadSession()), []);

  const openFile = async (file?: File) => {
    if (!file) return;
    try {
      const s = parseSession(await file.text());
      if (!s) throw new Error();
      setError("");
      setSession(null);
      setTimeout(() => setSession(s), 0);
    } catch {
      setError("That file isn't a MoonCanvas recording.");
    }
  };

  return (
    <div className="flex h-dvh flex-col gap-2 bg-soft p-2 sm:gap-3 sm:p-4">
      <header className="flex min-h-11 flex-wrap items-center justify-between gap-2">
        <Link to="/" className="flex items-center gap-2">
          <Logo size={32} />
          <span className="font-display text-xl text-foreground">MoonCanvas</span>
        </Link>
        <div className="flex items-center gap-2">
          <label className="inline-flex min-h-11 cursor-pointer items-center rounded-full bg-card px-4 text-sm font-semibold text-foreground shadow-soft">
            Open recording
            <input type="file" accept="application/json,.json" className="sr-only" onChange={(e) => openFile(e.target.files?.[0])} />
          </label>
          <Link to="/draw" search={{ document: undefined }} className="inline-flex min-h-11 items-center rounded-full bg-card px-4 text-sm font-semibold text-foreground shadow-soft">
            Back to drawing
          </Link>
        </div>
      </header>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {session && !session.complete && (
        <p className="text-sm text-muted-foreground">This recording was interrupted; it plays up to the last autosave.</p>
      )}
      <div className="flex-1 min-h-0">
        {session === undefined ? null : session ? (
          <Suspense fallback={null}>
            <PlaybackView key={session.startedAt} session={session} />
          </Suspense>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-4 rounded-3xl bg-card text-center shadow-soft">
            <p className="text-muted-foreground">No recording yet on this device.</p>
            <Link to="/draw" search={{ document: undefined }} className="inline-flex min-h-11 items-center rounded-full bg-primary px-6 font-semibold text-primary-foreground">
              Start drawing
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
