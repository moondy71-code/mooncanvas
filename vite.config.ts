// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    tanstackRouter({ target: "react", autoCodeSplitting: true }),
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "prompt",
      includeAssets: [
        "mooncanvas-icon.svg",
        "mooncanvas-icon-192.png",
        "mooncanvas-icon-512.png",
        "mooncanvas-icon-maskable-512.png",
      ],
      manifest: {
        id: "/mooncanvas",
        name: "MoonCanvas",
        short_name: "MoonCanvas",
        description: "A private, browser-based drawing space.",
        theme_color: "#172342",
        background_color: "#172342",
        display: "standalone",
        start_url: "/",
        scope: "/",
        icons: [
          { src: "mooncanvas-icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          {
            src: "mooncanvas-icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "mooncanvas-icon-maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        cacheId: "mooncanvas-v1",
        navigateFallback: "/index.html",
      },
    }),
  ],
  resolve: { tsconfigPaths: true },
});
