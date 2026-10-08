import { useEffect, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const isStandalone = () =>
  window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

/** A browser-only install prompt. It never affects active live-session connections. */
export function PwaInstallPrompt() {
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [standalone, setStandalone] = useState(true);
  const [isIos, setIsIos] = useState(false);

  useEffect(() => {
    setStandalone(isStandalone());
    setIsIos(/iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as Window & { MSStream?: unknown }).MSStream);
    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      setPrompt(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setPrompt(null);
      setStandalone(true);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const install = async () => {
    if (!prompt) return;
    await prompt.prompt();
    const choice = await prompt.userChoice;
    if (choice.outcome === "accepted") setPrompt(null);
  };

  if (standalone || (!prompt && !isIos)) return null;

  return (
    <section className="mt-5 max-w-xl rounded-3xl bg-card p-5 text-left shadow-soft">
      <h2 className="font-display text-2xl text-foreground">Install MoonCanvas</h2>
      {prompt ? (
        <>
          <p className="mt-2 text-sm text-muted-foreground">Install MoonCanvas on this device for a full-screen app experience.</p>
          <button onClick={() => void install()} className="mt-4 min-h-11 rounded-full bg-primary px-5 font-semibold text-primary-foreground">Install app</button>
        </>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">In Safari, tap Share, then choose <strong>Add to Home Screen</strong>.</p>
      )}
    </section>
  );
}
