import { createFileRoute, Link } from "@tanstack/react-router";
import { Logo } from "@/components/Logo";
import { PwaInstallPrompt } from "@/components/PwaInstallPrompt";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "MoonCanvas — Calm drawing for art therapy" },
      { name: "description", content: "A calm, distraction-free drawing space for remote art therapy sessions." },
      { property: "og:title", content: "MoonCanvas — Calm drawing for art therapy" },
      { property: "og:description", content: "A calm, distraction-free drawing space for remote art therapy sessions." },
    ],
  }),
  component: Home,
});

function Home() {
  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center bg-soft px-6 py-16 text-center">
      <Logo size={72} />
      <h1 className="mt-6 font-display text-5xl text-foreground sm:text-6xl">MoonCanvas</h1>
      <p className="mt-4 max-w-md text-lg text-muted-foreground">
        A quiet, open space to draw freely. Pick a colour, take your time, and let the page fill at your own pace.
      </p>
      <Link
        to="/draw"
        className="mt-10 inline-flex min-h-14 items-center rounded-full bg-primary px-10 text-lg font-semibold text-primary-foreground shadow-soft transition-colors hover:bg-primary/85"
      >
        Start Drawing
      </Link>
      <Link
        to="/playback"
        className="mt-3 inline-flex min-h-11 items-center rounded-full bg-card px-6 text-sm font-semibold text-foreground shadow-soft"
      >
        Open recording
      </Link>
      <PwaInstallPrompt />
      <p className="absolute inset-x-0 bottom-5 px-6 text-xs font-semibold tracking-wide text-muted-foreground/75">
        Created by moondy712016@gmail.com
      </p>
    </main>
  );
}
