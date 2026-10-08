import { Tldraw, type Editor } from "tldraw";
import "tldraw/tldraw.css";
import { useEffect, useRef, useState } from "react";
import { downloadBlob, formatTime, type RecordingSession } from "@/features/recording/session";
import { createTldrawPlayer } from "./tldrawPlayer";
import { drawingShapeUtils } from "./TldrawCanvas";
import { getDownloadDate, getExportShapeIds } from "./exportUtils";

const SPEEDS = [1, 2, 4] as const;

export default function PlaybackView({
  session,
  onClose,
}: {
  session: RecordingSession;
  onClose?: () => void;
}) {
  const duration = session.durationMs;
  const editorRef = useRef<Editor | null>(null);
  const playerRef = useRef<ReturnType<typeof createTldrawPlayer> | null>(null);
  const tRef = useRef(0);
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);

  const seek = (next: number) => {
    const v = Math.min(Math.max(next, 0), duration);
    tRef.current = v;
    playerRef.current?.seek(v);
    setT(v);
  };

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const next = tRef.current + (now - last) * speed;
      last = now;
      seek(next);
      if (next >= duration) return setPlaying(false);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, speed, duration]);

  const onMount = (editor: Editor) => {
    editorRef.current = editor;
    (window as unknown as { __mcPlayer?: unknown }).__mcPlayer = editor;
    editor.updateInstanceState({ isReadonly: true });
    const player = createTldrawPlayer(editor, session);
    playerRef.current = player;
    player.seek(duration);
    editor.zoomToFit();
    seek(0);
  };

  const togglePlay = () => {
    if (!playing && tRef.current >= duration) seek(0);
    setPlaying((p) => !p);
  };

  const exportPng = async () => {
    const editor = editorRef.current;
    if (!editor) return;
    setPlaying(false);
    seek(duration);
    const ids = getExportShapeIds(editor);
    if (!ids.length) return setExportMessage("There is nothing to download yet.");
    // Auto padding fits visual stroke overflow instead of clipping it to a fixed border.
    const { blob } = await editor.toImage(ids, {
      format: "png",
      background: true,
      padding: "auto",
    });
    downloadBlob(
      blob,
      `mindcanvas-drawing-${session.startedAt.slice(0, 19).replace(/[:T]/g, "-")}.png`,
    );
  };

  const [exportMessage, setExportMessage] = useState<string | null>(null);

  const exportSvg = async () => {
    const editor = editorRef.current;
    if (!editor) return;
    setPlaying(false);
    seek(duration);
    const ids = getExportShapeIds(editor);
    if (!ids.length) return setExportMessage("There is nothing to download yet.");

    try {
      // tldraw's official SVG exporter preserves supported vectors, transforms, and styles.
      const result = await editor.getSvgString(ids, { background: false, padding: "auto" });
      if (!result?.svg) return setExportMessage("SVG export is not available for these elements.");
      downloadBlob(
        new Blob([result.svg], { type: "image/svg+xml;charset=utf-8" }),
        `MoonCanvas-${getDownloadDate()}.svg`,
      );
      setExportMessage(null);
    } catch {
      setExportMessage(
        "Some elements could not be exported as SVG. Try exporting supported drawing elements only.",
      );
    }
  };

  const exportJson = () =>
    downloadBlob(
      new Blob([JSON.stringify(session, null, 2)], { type: "application/json" }),
      `mindcanvas-recording-${session.startedAt.slice(0, 19).replace(/[:T]/g, "-")}.json`,
    );

  const pill = "min-h-11 rounded-full px-4 text-sm font-semibold transition-colors";
  const idle = `${pill} bg-card text-foreground shadow-soft`;
  const active = `${pill} bg-primary text-primary-foreground`;

  return (
    <div className="flex h-full flex-col gap-3">
      {onClose && (
        <div className="flex justify-end">
          <button
            onClick={onClose}
            className="min-h-10 rounded-full bg-card px-4 text-sm font-semibold text-foreground shadow-soft"
          >
            Back to live drawing
          </button>
        </div>
      )}
      <div className="relative flex-1 overflow-hidden rounded-3xl bg-card shadow-soft">
        <div className="absolute inset-0">
          <Tldraw hideUi shapeUtils={drawingShapeUtils} onMount={onMount} />
        </div>
      </div>
      <div className="flex flex-col gap-3 rounded-3xl bg-card p-3 shadow-soft sm:p-4">
        <div className="flex items-center gap-3">
          <button
            onClick={togglePlay}
            className={`${active} min-w-24`}
            aria-label={playing ? "Pause" : "Play"}
          >
            {playing ? "Pause" : "Play"}
          </button>
          <input
            type="range"
            min={0}
            max={duration}
            step={1}
            value={t}
            onChange={(e) => seek(Number(e.target.value))}
            aria-label="Timeline"
            className="h-11 flex-1 accent-primary"
          />
          <span className="whitespace-nowrap text-sm tabular-nums text-muted-foreground">
            {formatTime(t)} / {formatTime(duration)}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {SPEEDS.map((s) => (
            <button
              key={s}
              onClick={() => setSpeed(s)}
              aria-pressed={speed === s}
              className={speed === s ? active : idle}
            >
              {s}x
            </button>
          ))}
          <span className="flex-1" />
          <button onClick={exportPng} className={idle}>
            Download PNG
          </button>
          <button onClick={() => void exportSvg()} className={idle}>
            Download SVG
          </button>
          <button onClick={exportJson} className={idle}>
            Download JSON
          </button>
        </div>
        {exportMessage && (
          <p className="text-sm text-muted-foreground" role="status">
            {exportMessage}
          </p>
        )}
      </div>
    </div>
  );
}
