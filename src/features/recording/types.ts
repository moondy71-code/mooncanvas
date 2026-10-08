/**
 * Engine-agnostic recording event model.
 * Phase 2A: used by an isolated feasibility prototype only (/lab/recording).
 * Nothing here depends on tldraw or on the web framework.
 */

export type DrawingTool = "draw" | "eraser" | "select" | "hand" | "other";

export interface StrokePoint {
  x: number;
  y: number;
  /** Stylus pressure 0..1 when supported */
  pressure?: number | undefined;
  /** ms since session start */
  t: number;
}

export type DrawingEvent =
  | { type: "stroke-start"; strokeId: string; t: number; tool: DrawingTool; color: string; size: string; isPen: boolean }
  | { type: "stroke-point"; strokeId: string; point: StrokePoint }
  | { type: "stroke-end"; strokeId: string; t: number }
  | { type: "erase"; targetIds: string[]; t: number }
  | { type: "tool-change"; tool: DrawingTool; t: number }
  | { type: "style-change"; color?: string; size?: string; t: number }
  /** The document page visible at this moment in a multi-page drawing. */
  | { type: "page-change"; pageId: string; t: number }
  | { type: "undo"; t: number }
  | { type: "redo"; t: number }
  /** Document diff from the engine; used to reconstruct the drawing on replay. */
  | { type: "engine-change"; t: number; raw: unknown };

/** Anything that wants to receive drawing events (recorder, IndexedDB buffer, sync). */
export interface DrawingEventSink {
  push(event: DrawingEvent): void;
}

/** Default sink: discards everything. */
export const noopSink: DrawingEventSink = { push: () => {} };

/** In-memory sink for the prototype (no persistence). */
export function createMemorySink() {
  const events: DrawingEvent[] = [];
  return { events, push: (e: DrawingEvent) => void events.push(e) };
}
