/* eslint-disable no-unreachable */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { importSessionEncryptionKey } from "@/features/live/crypto";
import { LiveDrawingSession } from "@/features/live/LiveDrawingSession";
import { getLiveSessionTabValue, getLiveSessionValue, putLiveSessionValue, rememberLiveSession } from "@/features/live/sessionPersistence";

export const Route = createFileRoute("/session/$sessionId")({
  validateSearch: (search: Record<string, unknown>) => ({ role: search["role"] === "therapist" ? "therapist" as const : undefined }),
  component: ClientInvitationPage,
});
function ClientInvitationPage() {
  // Live counselling is deliberately disabled in MoonCanvas Phase 1. Keep the
  // legacy implementation below for Phase 2 analysis, but never initialize it.
  return (
    <main className="flex min-h-dvh items-center justify-center bg-soft p-6">
      <section className="max-w-md rounded-3xl bg-card p-6 shadow-soft">
        <h1 className="font-display text-3xl text-foreground">Sessions unavailable</h1>
        <p className="mt-3 text-sm text-muted-foreground">MoonCanvas is a private drawing app. Live counselling sessions are not available.</p>
        <Link to="/" className="mt-5 block text-sm text-muted-foreground underline">Back home</Link>
      </section>
    </main>
  );

  const { sessionId } = Route.useParams();
  const { role } = Route.useSearch();
  const [ready, setReady] = useState(false);
  const [joined, setJoined] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (role === "therapist") {
      if (!getLiveSessionTabValue(sessionId, "key") || !getLiveSessionTabValue(sessionId, "therapist-refresh")) setError("This therapist session was closed. Create a new session to continue.");
      else setReady(true);
      return;
    }
    const params = new URLSearchParams(window.location.hash.slice(1));
    const capability = params.get("mc_invite");
    const key = params.get("mc_key");
    // The one-time URL fragment is removed as soon as it is consumed. A reload in the
    // same browser tab must resume from the browser-held key and client refresh secret.
    if (!capability || !key) {
      if (getLiveSessionValue(sessionId, "key") && getLiveSessionValue(sessionId, "client-refresh")) {
        setReady(true);
        setJoined(true);
        return;
      }
      setError("This invitation is incomplete or has already been removed.");
      return;
    }
    void importSessionEncryptionKey(key).then((imported) => {
      if (!imported) return setError("This invitation has an invalid encryption key.");
      sessionStorage.setItem(`mindcanvas.live.${sessionId}.client-capability`, capability);
      sessionStorage.setItem(`mindcanvas.live.${sessionId}.key`, key);
      history.replaceState(null, "", window.location.pathname + window.location.search);
      setReady(true);
    });
  }, [role, sessionId]);

  useEffect(() => {
    if (role === "therapist" || !ready || joined || error) return;
    let active = true;

    const join = async () => {
      const capability = sessionStorage.getItem(`mindcanvas.live.${sessionId}.client-capability`);
      if (!capability) return active && setError("This invitation is unavailable in this browser.");
      const response = await fetch(`/api/mindcanvas/sessions/${sessionId}/join`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ capability }) });
      if (!response.ok) return active && setError(response.status === 409 ? "This invitation has already been used." : "This invitation is invalid, expired, or unavailable.");
      const result = (await response.json()) as { refreshSecret: string; expiresAt: string };
      if (!active) return;
      const key = sessionStorage.getItem(`mindcanvas.live.${sessionId}.key`);
      if (!key) return setError("This browser no longer holds the session encryption key.");
      rememberLiveSession(sessionId, { role: "client", expiresAt: result.expiresAt });
      putLiveSessionValue(sessionId, "key", key);
      putLiveSessionValue(sessionId, "client-refresh", result.refreshSecret);
      sessionStorage.removeItem(`mindcanvas.live.${sessionId}.client-capability`);
      setJoined(true);
    };

    void join();
    return () => { active = false; };
  }, [error, joined, ready, role, sessionId]);

  if (!error && ((role === "therapist" && ready) || joined)) return <LiveDrawingSession sessionId={sessionId} role={role === "therapist" ? "therapist" : "client"} onFatal={setError} />;

  return <main className="flex min-h-dvh items-center justify-center bg-soft p-6"><section className="max-w-md rounded-3xl bg-card p-6 shadow-soft"><h1 className="font-display text-3xl text-foreground">MindCanvas session</h1><p className="mt-3 text-sm text-muted-foreground">Your invitation key is processed only in this browser and was removed from the address bar.</p>{error && <><p className="mt-4 text-sm text-destructive" role="alert">{error}</p>{role !== "therapist" && <p className="mt-3 text-sm text-muted-foreground">Ask your therapist for a new invitation.</p>}</>}{ready && role !== "therapist" && <p className="mt-5 text-sm text-muted-foreground" role="status">Joining secure session…</p>}{role === "therapist" && <Link to="/" className="mt-5 block text-sm text-muted-foreground underline">Back home</Link>}</section></main>;
}
