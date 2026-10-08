import { describe, expect, it } from "vitest";

function memoryStorage() {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) } as unknown as Storage;
}

describe("custom color storage", () => {
  async function customColor() {
    const css = globalThis.CSS as unknown as { supports?: () => boolean } | undefined;
    if (css) Object.assign(css, { supports: () => false });
    else Object.defineProperty(globalThis, "CSS", { configurable: true, value: { supports: () => false } });
    return import("./customColor");
  }

  it("accepts only six-digit HEX values and normalizes casing", async () => {
    const { normalizeHexColor } = await customColor();
    expect(normalizeHexColor("ff5733")).toBe("#FF5733");
    expect(normalizeHexColor("#87cefa")).toBe("#87CEFA");
    expect(normalizeHexColor("red")).toBeNull();
    expect(normalizeHexColor("#123")).toBeNull();
  });

  it("keeps five distinct recent colors with the newest first", async () => {
    const { readRecentCustomColors, saveRecentCustomColor } = await customColor();
    const storage = memoryStorage();
    ["#111111", "#222222", "#333333", "#444444", "#555555", "#666666", "#222222"].forEach((color) => saveRecentCustomColor(color, storage));
    expect(readRecentCustomColors(storage)).toEqual(["#222222", "#666666", "#555555", "#444444", "#333333"]);
  });
});
