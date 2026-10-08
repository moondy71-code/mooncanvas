import { useEffect, useState } from "react";

type OfflineState = { online: boolean; ready: boolean };

async function isOfflineReady() {
  if (!("serviceWorker" in navigator) || !("caches" in window)) return false;
  const registration = await navigator.serviceWorker.ready;
  const cacheNames = await caches.keys();
  return (
    Boolean(registration.active) && cacheNames.some((name) => name.startsWith("mooncanvas-v1"))
  );
}

export function OfflineStatus() {
  const [state, setState] = useState<OfflineState>({ online: navigator.onLine, ready: false });

  useEffect(() => {
    const updateConnection = () =>
      setState((current) => ({ ...current, online: navigator.onLine }));
    const prepare = async () => {
      try {
        const ready = await isOfflineReady();
        setState({ online: navigator.onLine, ready });
        if (ready && navigator.storage?.persist) void navigator.storage.persist();
      } catch {
        updateConnection();
      }
    };
    void prepare();
    window.addEventListener("online", updateConnection);
    window.addEventListener("offline", updateConnection);
    return () => {
      window.removeEventListener("online", updateConnection);
      window.removeEventListener("offline", updateConnection);
    };
  }, []);

  const label = state.online
    ? state.ready
      ? "Online · Offline ready"
      : "Online"
    : state.ready
      ? "Offline · Ready to draw"
      : "Offline · Connect once to finish setup";

  return (
    <span
      className={`mc-offline-status ${state.online ? "is-online" : "is-offline"}`}
      role="status"
    >
      {label}
    </span>
  );
}
