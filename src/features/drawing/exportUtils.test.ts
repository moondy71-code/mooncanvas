import { describe, expect, it } from "vitest";
import { getDownloadDate, getExportShapeIds } from "./exportUtils";

describe("SVG export helpers", () => {
  it("uses selected shapes before the rest of the page", () => {
    const editor = {
      getSelectedShapeIds: () => ["shape:selected"] as never[],
      getCurrentPageShapeIds: () => new Set(["shape:page"] as never[]),
    };

    expect(getExportShapeIds(editor)).toEqual(["shape:selected"]);
  });

  it("uses the local download date in the SVG filename format", () => {
    expect(getDownloadDate(new Date("2026-10-09T15:30:00+02:00"))).toMatch(/^2026-10-09$/);
  });
});
