import { DefaultColorStyle, DrawShapeUtil, type DrawShapeOptions, type Editor, type JsonObject, type TLDrawShape } from "tldraw";

const INSTANCE_COLOR_KEY = "mooncanvasCustomColor";
const SHAPE_COLOR_KEY = "mooncanvasCustomColor";
const RECENT_COLORS_KEY = "mooncanvas.recent-custom-colors.v1";
const MAX_RECENT_COLORS = 5;

type MetaWithCustomColor = JsonObject;

export function normalizeHexColor(value: string): string | null {
  const color = value.trim();
  const match = /^#?([0-9a-f]{6})$/i.exec(color);
  return match ? `#${match[1]!.toUpperCase()}` : null;
}

export function getShapeCustomColor(shape: TLDrawShape): string | null {
  const value = (shape.meta as MetaWithCustomColor)[SHAPE_COLOR_KEY];
  return typeof value === "string" ? normalizeHexColor(value) : null;
}

export function getActiveCustomColor(editor: Editor): string | null {
  const value = (editor.getInstanceState().meta as MetaWithCustomColor)[INSTANCE_COLOR_KEY];
  return typeof value === "string" ? normalizeHexColor(value) : null;
}

export function setActiveCustomColor(editor: Editor, value: string) {
  const color = normalizeHexColor(value);
  if (!color) return false;
  editor.setStyleForNextShapes(DefaultColorStyle, "black");
  editor.updateInstanceState({ meta: { ...editor.getInstanceState().meta, [INSTANCE_COLOR_KEY]: color } });
  return true;
}

export function clearActiveCustomColor(editor: Editor) {
  const meta = { ...editor.getInstanceState().meta } as MetaWithCustomColor;
  delete meta[INSTANCE_COLOR_KEY];
  editor.updateInstanceState({ meta });
}

export function readRecentCustomColors(storage: Storage | null = typeof window === "undefined" ? null : window.localStorage): string[] {
  if (!storage) return [];
  try {
    const raw = JSON.parse(storage.getItem(RECENT_COLORS_KEY) ?? "[]");
    if (!Array.isArray(raw)) return [];
    return raw.map((value) => typeof value === "string" ? normalizeHexColor(value) : null).filter((value): value is string => !!value).slice(0, MAX_RECENT_COLORS);
  } catch {
    return [];
  }
}

export function saveRecentCustomColor(color: string, storage: Storage | null = typeof window === "undefined" ? null : window.localStorage): string[] {
  const normalized = normalizeHexColor(color);
  if (!normalized) return readRecentCustomColors(storage);
  const next = [normalized, ...readRecentCustomColors(storage).filter((item) => item !== normalized)].slice(0, MAX_RECENT_COLORS);
  try { storage?.setItem(RECENT_COLORS_KEY, JSON.stringify(next)); } catch { /* Storage may be unavailable in private mode. */ }
  return next;
}

/**
 * Standard tldraw draw shapes retain their enum color for schema compatibility.
 * A validated custom HEX in shape.meta changes only the display value.
 */
export class MindCanvasDrawShapeUtil extends DrawShapeUtil {
  static override type = "draw" as const;
  private readonly defaultOptions = new DrawShapeUtil(this.editor).options;

  override options: DrawShapeOptions = {
    ...this.defaultOptions,
    getDefaultDisplayValues: (editor, shape, theme, colorMode) => {
      const defaults = this.defaultOptions.getDefaultDisplayValues(editor, shape, theme, colorMode);
      const custom = getShapeCustomColor(shape);
      if (!custom) return defaults;
      return {
        ...defaults,
        strokeColor: custom,
        fillColor: shape.props.fill === "none" ? "transparent" : custom,
        patternFillFallbackColor: custom,
      };
    },
  };
}

/** Adds the active custom color to newly-created local strokes only. */
export function installCustomColorStamp(editor: Editor) {
  return editor.store.listen((entry) => {
    const custom = getActiveCustomColor(editor);
    if (!custom) return;
    for (const record of Object.values(entry.changes.added)) {
      if (record.typeName !== "shape" || record.type !== "draw") continue;
      const shape = record as TLDrawShape;
      if (getShapeCustomColor(shape)) continue;
      editor.updateShape({
        id: shape.id,
        type: "draw",
        meta: { ...shape.meta, [SHAPE_COLOR_KEY]: custom },
      });
    }
  }, { source: "user", scope: "document" });
}
