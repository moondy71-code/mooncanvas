import type { TLShape } from "tldraw";

export function getGroupControlState(shapes: TLShape[]) {
  return {
    canGroup: shapes.length > 1,
    canUngroup: shapes.some((shape) => shape.type === "group"),
  };
}
