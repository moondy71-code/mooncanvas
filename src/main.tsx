import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import "./styles.css";
import { getRouter } from "./router";

const router = getRouter();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);

const splash = document.getElementById("mc-splash");
const splashImage = splash?.querySelector("img");
const splashStartedAt = performance.now();
const minimumSplashDuration = 850;
let splashDismissed = false;

function dismissSplash() {
  if (splashDismissed || !splash) return;

  splashDismissed = true;
  splash.classList.add("mc-splash--leaving");
  splash.addEventListener("transitionend", () => splash.remove(), { once: true });
}

function dismissWhenReady() {
  const elapsed = performance.now() - splashStartedAt;
  window.setTimeout(dismissSplash, Math.max(0, minimumSplashDuration - elapsed));
}

if (splashImage?.complete) {
  dismissWhenReady();
} else {
  splashImage?.addEventListener("load", dismissWhenReady, { once: true });
  splashImage?.addEventListener("error", dismissWhenReady, { once: true });
  window.setTimeout(dismissWhenReady, 2500);
}
