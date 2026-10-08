import { useEffect, useState } from "react";

type WakeLockSentinelLike = {
  released: boolean;
  release: () => Promise<void>;
  addEventListener: (type: "release", listener: () => void) => void;
};

type WakeLockNavigator = Navigator & {
  wakeLock?: { request: (type: "screen") => Promise<WakeLockSentinelLike> };
};

/** Keeps an active consultation visible when the browser and operating system allow it. */
export function useScreenWakeLock(active: boolean) {
  const [held, setHeld] = useState(false);

  useEffect(() => {
    const wakeLock = (navigator as WakeLockNavigator).wakeLock;
    if (!active || !wakeLock) {
      setHeld(false);
      return;
    }

    let disposed = false;
    let sentinel: WakeLockSentinelLike | null = null;

    const acquire = async () => {
      if (disposed || document.visibilityState !== "visible" || sentinel && !sentinel.released) return;
      try {
        sentinel = await wakeLock.request("screen");
        setHeld(true);
        sentinel.addEventListener("release", () => { sentinel = null; setHeld(false); });
      } catch {
        setHeld(false);
        // Permissions, power saver, and some mobile browsers may refuse this request.
      }
    };

    const onVisibilityChange = () => { if (document.visibilityState === "visible") void acquire(); };
    document.addEventListener("visibilitychange", onVisibilityChange);
    void acquire();
    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      setHeld(false);
      void sentinel?.release();
    };
  }, [active]);

  return held;
}
