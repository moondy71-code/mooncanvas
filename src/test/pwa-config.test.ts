import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const viteConfig = readFileSync(resolve(root, "vite.config.ts"), "utf8");
const html = readFileSync(resolve(root, "index.html"), "utf8");

describe("offline PWA configuration", () => {
  it("keeps MoonCanvas assets and navigation fallback in the Workbox precache setup", () => {
    expect(viteConfig).toContain('cacheId: "mooncanvas-v1"');
    expect(viteConfig).toContain('navigateFallback: "/index.html"');
    expect(viteConfig).toContain("cleanupOutdatedCaches: true");
    expect(viteConfig).toContain('"mooncanvas-logo.png"');
  });

  it("does not require Google Fonts to start the app", () => {
    expect(html).not.toContain("fonts.googleapis.com");
    expect(html).not.toContain("fonts.gstatic.com");
  });
});
