import type { Editor, RecordsDiff, TLPageId, TLRecord } from "tldraw";
import type { DrawingEvent } from "@/features/recording/types";
import type { RecordingSession } from "@/features/recording/session";
import { isContentRecord } from "./recordingController";

type PlaybackEvent = Extract<DrawingEvent, { type: "engine-change" | "page-change" }>;

/**
 * Deterministic player: the drawing state at time t = initial records + every
 * recorded diff with timestamp <= t. Seeking backwards rebuilds from the start,
 * so erasing and undo/redo are reproduced exactly.
 */
export function createTldrawPlayer(editor: Editor, session: RecordingSession) {
  const events = session.events
    .filter((event): event is PlaybackEvent => event.type === "engine-change" || event.type === "page-change")
    .toSorted((a, b) => a.t - b.t);
  let idx = 0;

  // tldraw creates a page's camera and local page-state as a consequence of
  // inserting the page record. Do not switch pages inside mergeRemoteChanges:
  // that transaction can run before those local records are available.
  const setPageWhenReady = (pageId: string | undefined) => {
    if (!pageId || !editor.getPage(pageId as TLPageId)) return;
    editor.setCurrentPage(pageId as TLPageId);
  };

  const reset = () => {
    editor.store.mergeRemoteChanges(() => {
      // Keep the editor's current page record while rebuilding. Removing it first
      // can leave tldraw without a valid current-page pointer during multi-page replay.
      const ids = editor.store.allRecords()
        .filter(isContentRecord)
        .filter((record) => record.typeName !== "page" || record.id !== editor.getCurrentPageId())
        .map((record) => record.id);
      if (ids.length) editor.store.remove(ids);
      if (session.initialRecords.length) editor.store.put(session.initialRecords as TLRecord[]);
    });
    setPageWhenReady(session.initialPageId);
    idx = 0;
  };

  const seek = (t: number) => {
    if (idx > 0 && events[idx - 1]!.t > t) reset();
    if (idx >= events.length || events[idx]!.t > t) return;
    let requestedPageId: string | undefined;
    editor.store.mergeRemoteChanges(() => {
      while (idx < events.length && events[idx]!.t <= t) {
        const event = events[idx]!;
        if (event.type === "engine-change") {
          const diff = event.raw as RecordsDiff<TLRecord>;
          const rm = Object.keys(diff.removed).filter((id) => editor.store.has(id as TLRecord["id"])) as TLRecord["id"][];
          if (rm.length) editor.store.remove(rm);
          const put = [...Object.values(diff.added), ...Object.values(diff.updated).map(([, to]) => to)];
          if (put.length) editor.store.put(put);
        } else {
          requestedPageId = event.pageId;
        }
        idx++;
      }
    });
    setPageWhenReady(requestedPageId);
  };

  reset();
  return { seek, reset };
}
