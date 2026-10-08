import { Tldraw, type Editor } from "tldraw";
import "tldraw/tldraw.css";
import { useRef, useState } from "react";
import { createMemorySink, type DrawingEvent } from "@/features/recording/types";
import { attachTldrawRecorder, replayInto } from "./tldrawRecorder";
import { drawingShapeUtils } from "./TldrawCanvas";

/** Isolated Phase 2A feasibility prototype. In-memory only, no storage. */
export default function RecordingLab() {
  const rec = useRef<Editor | null>(null);
  const play = useRef<Editor | null>(null);
  const stop = useRef<null | (() => void)>(null);
  const [recording, setRecording] = useState(false);
  const [events, setEvents] = useState<DrawingEvent[]>([]);

  const start = () => {
    if (!rec.current) return;
    const sink = createMemorySink();
    stop.current = attachTldrawRecorder(rec.current, sink);
    (window as unknown as { __mcEvents: DrawingEvent[] }).__mcEvents = sink.events;
    setEvents(sink.events);
    setRecording(true);
  };
  const end = () => {
    stop.current?.();
    stop.current = null;
    setEvents((e) => [...e]);
    setRecording(false);
  };
  const counts = events.reduce<Record<string, number>>((a, e) => ((a[e.type] = (a[e.type] ?? 0) + 1), a), {});
  const download = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(events, null, 2)], { type: "application/json" }));
    Object.assign(document.createElement("a"), { href: url, download: "mindcanvas-demo-recording.json" }).click();
  };
  const btn = "min-h-11 rounded-full px-4 text-sm font-semibold bg-card text-foreground shadow-soft disabled:opacity-40";

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <button className={btn} onClick={start} disabled={recording}>Record</button>
        <button className={btn} onClick={end} disabled={!recording}>Stop</button>
        <button className={btn} onClick={() => play.current && replayInto(play.current, events)} disabled={recording || !events.length}>Replay</button>
        <button className={btn} onClick={download} disabled={recording || !events.length}>Download JSON</button>
        <span className="text-sm text-muted-foreground">
          {recording ? "Recording… " : ""}
          {Object.entries(counts).map(([k, v]) => `${k}: ${v}`).join(" · ") || "No events yet"}
        </span>
      </div>
      <div className="grid flex-1 grid-cols-1 gap-3 md:grid-cols-2">
        <div className="relative min-h-[320px] overflow-hidden rounded-3xl bg-card shadow-soft">
          <div className="absolute inset-0">
            <Tldraw shapeUtils={drawingShapeUtils} onMount={(e) => { rec.current = e; e.setCurrentTool("draw"); (window as any).__mcRec = e; }} />
          </div>
        </div>
        <div className="relative min-h-[320px] overflow-hidden rounded-3xl bg-card shadow-soft">
          <div className="absolute inset-0">
            <Tldraw hideUi shapeUtils={drawingShapeUtils} onMount={(e) => { play.current = e; e.updateInstanceState({ isReadonly: true }); (window as any).__mcPlay = e; }} />
          </div>
        </div>
      </div>
    </div>
  );
}
