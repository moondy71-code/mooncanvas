import type { TLRecord } from "tldraw";

/** Content that belongs to a drawing document, excluding local UI/instance records. */
export const isContentRecord = (record: TLRecord) =>
  record.typeName === "page" || record.typeName === "shape" || record.typeName === "binding";
