import { DefaultColorStyle, DefaultSizeStyle, react, type Editor, type TLEventInfo, type TLRecord, type RecordsDiff } from "tldraw";
import type { DrawingEvent, DrawingEventSink, DrawingTool } from "@/features/recording/types";
import { getActiveCustomColor } from "./customColor";

/** Adapter: translates tldraw (public API only) into engine-agnostic DrawingEvents. */
export function attachTldrawRecorder(editor: Editor, sink: DrawingEventSink, t0 = performance.now(), source: "user" | "all" = "user") {
  const now = () => Math.round((performance.now() - t0) * 10) / 10;
  const toolOf = (): DrawingTool => {
    const id = editor.getCurrentToolId();
    return (["draw", "eraser", "select", "hand"].includes(id) ? id : "other") as DrawingTool;
  };
  const color = () => getActiveCustomColor(editor) ?? String(editor.getStyleForNextShape(DefaultColorStyle));
  const size = () => String(editor.getStyleForNextShape(DefaultSizeStyle));

  let stroke: string | null = null;
  let n = 0;
  const onEvent = (info: TLEventInfo) => {
    if (info.type !== "pointer") return;
    const tool = toolOf();
    if (tool !== "draw" && tool !== "eraser") return;
    const p = editor.screenToPage(info.point);
    const pressure = info.isPen ? info.point.z : undefined;
    if (info.name === "pointer_down") {
      stroke = `s${++n}`;
      sink.push({ type: "stroke-start", strokeId: stroke, t: now(), tool, color: color(), size: size(), isPen: info.isPen });
    }
    if (stroke && (info.name === "pointer_down" || info.name === "pointer_move")) {
      sink.push({ type: "stroke-point", strokeId: stroke, point: { x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10, pressure, t: now() } });
    }
    if (stroke && info.name === "pointer_up") {
      sink.push({ type: "stroke-end", strokeId: stroke, t: now() });
      stroke = null;
    }
  };
  editor.on("event", onEvent);

  let lastTool = "";
  const stopTool = react("mc-tool", () => {
    const tool = toolOf();
    if (tool === lastTool) return;
    lastTool = tool;
    sink.push({ type: "tool-change", tool, t: now() });
  });
  let lastStyle = "";
  const stopStyle = react("mc-style", () => {
    const key = color() + "|" + size();
    if (key === lastStyle) return;
    lastStyle = key;
    sink.push({ type: "style-change", color: color(), size: size(), t: now() });
  });

  // Wrap the public undo/redo methods on this editor instance (no tldraw source changes).
  const origUndo = editor.undo.bind(editor);
  const origRedo = editor.redo.bind(editor);
  editor.undo = () => (sink.push({ type: "undo", t: now() }), origUndo());
  editor.redo = () => (sink.push({ type: "redo", t: now() }), origRedo());

  const stopStore = editor.store.listen(
    (entry) => {
      const removed = Object.keys(entry.changes.removed).filter((id) => id.startsWith("shape:"));
      if (removed.length && toolOf() === "eraser") sink.push({ type: "erase", targetIds: removed, t: now() });
      sink.push({ type: "engine-change", t: now(), raw: entry.changes });
    },
    { source, scope: "document" },
  );

  const stopPage = editor.store.listen(
    (entry) => {
      const pageChanged = Object.values(entry.changes.updated).some(([from, to]) =>
        from.typeName === "instance" && to.typeName === "instance" && from.currentPageId !== to.currentPageId,
      );
      if (pageChanged) sink.push({ type: "page-change", pageId: String(editor.getCurrentPageId()), t: now() });
    },
    { source, scope: "all" },
  );

  return () => {
    editor.off("event", onEvent);
    stopTool();
    stopStyle();
    stopStore();
    stopPage();
    editor.undo = origUndo;
    editor.redo = origRedo;
  };
}

/** Replays recorded document diffs into another editor with the original timing. */
export function replayInto(editor: Editor, events: DrawingEvent[], speed = 1) {
  const diffs = events.filter((e) => e.type === "engine-change") as Extract<DrawingEvent, { type: "engine-change" }>[];
  const timers: number[] = [];
  const start = diffs[0]?.t ?? 0;
  editor.store.mergeRemoteChanges(() => {
    const ids = [...editor.getCurrentPageShapeIds()];
    if (ids.length) editor.deleteShapes(ids);
  });
  for (const d of diffs) {
    timers.push(
      window.setTimeout(() => {
        const diff = d.raw as RecordsDiff<TLRecord>;
        editor.store.mergeRemoteChanges(() => {
          const put = [...Object.values(diff.added), ...Object.values(diff.updated).map(([, to]) => to)];
          if (put.length) editor.store.put(put);
          const rm = Object.keys(diff.removed) as TLRecord["id"][];
          if (rm.length) editor.store.remove(rm);
        });
      }, (d.t - start) / speed),
    );
  }
  return () => timers.forEach(clearTimeout);
}
