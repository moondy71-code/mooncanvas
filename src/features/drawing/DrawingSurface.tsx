import { lazy, Suspense, useEffect, useState } from "react";
import type { TldrawCanvasProps } from "./TldrawCanvas";

/**
 * Engine-agnostic wrapper. Swap TldrawCanvas for another engine here
 * without touching pages. Loaded client-only (engine needs the DOM).
 */
const TldrawCanvas = lazy(() => import("./TldrawCanvas"));

export function DrawingSurface(props: TldrawCanvasProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const fallback = <div className="flex h-full items-center justify-center text-muted-foreground">Preparing canvas…</div>;
  if (!mounted) return fallback;
  return (
    <Suspense fallback={fallback}>
      <TldrawCanvas {...props} />
    </Suspense>
  );
}
