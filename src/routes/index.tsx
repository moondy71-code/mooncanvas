import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Logo } from "@/components/Logo";
import { OfflineStatus } from "@/components/OfflineStatus";
import { PwaInstallPrompt } from "@/components/PwaInstallPrompt";
import { createDocument, getLastDocument, type MoonCanvasDocument } from "@/features/drawing/documents";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "MoonCanvas — Create under the moon" },
      {
        name: "description",
        content: "A private drawing space for creating under the moon.",
      },
      { property: "og:title", content: "MoonCanvas — Create under the moon" },
      {
        property: "og:description",
        content: "A private drawing space for creating under the moon.",
      },
    ],
  }),
  component: Home,
});

function Home() {
  const navigate = useNavigate();
  const [lastDocument, setLastDocument] = useState<MoonCanvasDocument | null>(null);

  useEffect(() => setLastDocument(getLastDocument()), []);

  const openLastDrawing = () => {
    const document = lastDocument ?? getLastDocument();
    navigate({ to: "/draw", search: { document: document.id } });
  };

  const startNewDrawing = () => {
    const document = createDocument();
    setLastDocument(document);
    navigate({ to: "/draw", search: { document: document.id } });
  };

  return (
    <main className="moon-shell relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-6 py-16 text-center">
      <div className="moon-orbit absolute size-[min(94vw,38rem)] rounded-full" aria-hidden="true" />
      <div className="relative flex flex-col items-center">
        <Logo size={88} />
        <div className="mt-4">
          <OfflineStatus />
        </div>
        <p className="moon-kicker mt-7 text-xs font-bold">Create under the moon.</p>
        <h1 className="mt-3 font-display text-5xl text-foreground sm:text-6xl">MoonCanvas</h1>
        <p className="mt-4 max-w-md text-lg text-muted-foreground">
          A warm, private space for ideas, sketches, and moments of calm.
        </p>
        <button
          type="button"
          onClick={openLastDrawing}
          className="mt-10 inline-flex min-h-14 items-center rounded-full bg-primary px-10 text-lg font-bold text-primary-foreground shadow-soft transition-transform hover:scale-[1.02]"
        >
          Continue drawing
        </button>
        <button
          type="button"
          onClick={startNewDrawing}
          className="moon-secondary-button mt-3 inline-flex min-h-11 items-center justify-center rounded-full px-6 text-sm font-semibold shadow-soft"
        >
          Start a new drawing
        </button>
        <Link
          to="/playback"
          className="moon-secondary-button mt-3 inline-flex min-h-11 items-center rounded-full px-6 text-sm font-semibold shadow-soft"
        >
          Open recording
        </Link>
        <PwaInstallPrompt />
      </div>
      <p className="absolute inset-x-0 bottom-[max(1.25rem,env(safe-area-inset-bottom))] px-6 text-xs font-semibold tracking-wide text-muted-foreground/75">
        Your drawings stay on this device.
      </p>
    </main>
  );
}
