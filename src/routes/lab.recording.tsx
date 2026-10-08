import { createFileRoute, Link } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useState } from "react";
import { Logo } from "@/components/Logo";

const RecordingLab = lazy(() => import("@/features/drawing/RecordingLab"));

export const Route = createFileRoute("/lab/recording")({
  head: () => ({
    meta: [
      { title: "Recording test — MoonCanvas" },
      { name: "description", content: "Internal feasibility test for recording and replaying a drawing session." },
      { property: "og:title", content: "Recording test — MoonCanvas" },
      { property: "og:description", content: "Internal feasibility test for recording and replaying a drawing session." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: LabPage,
});

function LabPage() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return (
    <div className="flex h-dvh flex-col gap-3 bg-soft p-3 sm:p-4">
      <header className="flex items-center gap-2">
        <Link to="/" className="flex items-center gap-2">
          <Logo size={32} />
          <span className="font-display text-xl text-foreground">MoonCanvas</span>
        </Link>
        <span className="text-sm text-muted-foreground">· Recording test (demo only, nothing is saved)</span>
      </header>
      <div className="flex-1">
        {mounted && (
          <Suspense fallback={null}>
            <RecordingLab />
          </Suspense>
        )}
      </div>
    </div>
  );
}
