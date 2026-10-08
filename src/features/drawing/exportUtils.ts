import type { Editor, TLShapeId } from "tldraw";

type ExportEditor = Pick<Editor, "getCurrentPageShapeIds" | "getSelectedShapeIds">;

/** Exports the selection when present, otherwise the entire current page. */
export function getExportShapeIds(editor: ExportEditor): TLShapeId[] {
  const selectedIds = editor.getSelectedShapeIds();
  return selectedIds.length ? selectedIds : [...editor.getCurrentPageShapeIds()];
}

export function getDownloadDate(date = new Date()) {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}
