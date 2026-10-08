import { describe, expect, it } from "vitest";
import { getGroupControlState } from "./groupControls";

describe("group controls", () => {
  it("enables grouping only for two or more selected shapes", () => {
    expect(getGroupControlState([])).toEqual({ canGroup: false, canUngroup: false });
    expect(getGroupControlState([{ type: "draw" }] as never)).toEqual({
      canGroup: false,
      canUngroup: false,
    });
    expect(getGroupControlState([{ type: "draw" }, { type: "geo" }] as never)).toEqual({
      canGroup: true,
      canUngroup: false,
    });
  });
  it("enables ungrouping when a selected group is present", () => {
    expect(getGroupControlState([{ type: "group" }] as never)).toEqual({
      canGroup: false,
      canUngroup: true,
    });
  });
});
