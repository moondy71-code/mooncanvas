import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { createSessionEncryptionKey, exportSessionEncryptionKey, makeInviteFragment } from "./crypto";
import { clearLiveSession, getLiveSessionResume, getLiveSessionTabValue, getLiveSessionValue, putLiveSessionValue, rememberLiveSession } from "./sessionPersistence";

type CreatedSession = { sessionId: string; expiresAt: string; clientCapability: string; therapistRefresh: string };
type SavedPanelSession = Pick<CreatedSession, "sessionId" | "expiresAt" | "clientCapability">;
const panelKey = "mindcanvas.live.therapist-panel";

function loadSavedSession(): CreatedSession | null {
  try {
    const raw = localStorage.getItem(panelKey);
    if (!raw) return null;
    const session = JSON.parse(raw) as SavedPanelSession;
    const resume = getLiveSessionResume(session.sessionId);
    const hasOpenTherapistTab = Boolean(
      getLiveSessionTabValue(session.sessionId, "key") && getLiveSessionTabValue(session.sessionId, "therapist-refresh"),
    );
    if (!hasOpenTherapistTab) {
      // The therapist app was fully closed. Do not revive authority or show a
      // stale invitation; the next consultation begins with a new session.
      clearLiveSession(session.sessionId);
      localStorage.removeItem(panelKey);
      return null;
    }
    return resume?.role === "therapist" && session.expiresAt === resume.expiresAt
      ? { ...session, therapistRefresh: "" }
      : null;
  } catch {
    return null;
  }
}

function savePanelSession(session: CreatedSession | null) {
  try {
    if (session) {
      const saved: SavedPanelSession = {
        sessionId: session.sessionId,
        expiresAt: session.expiresAt,
        clientCapability: session.clientCapability,
      };
      localStorage.setItem(panelKey, JSON.stringify(saved));
    }
    else localStorage.removeItem(panelKey);
  } catch { /* Temporary local session state is best-effort. */ }
}

export function TherapistSessionPanel() {
  const [session, setSession] = useState<CreatedSession | null>(loadSavedSession);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const create = async () => {
    setError("");
    try {
      const key = await exportSessionEncryptionKey(await createSessionEncryptionKey());
      const response = await fetch("/api/mindcanvas/sessions", { method: "POST" });
      if (!response.ok) throw new Error("The secure session service is not available yet.");
      const created = (await response.json()) as CreatedSession;
      rememberLiveSession(created.sessionId, { role: "therapist", expiresAt: created.expiresAt });
      putLiveSessionValue(created.sessionId, "key", key);
      putLiveSessionValue(created.sessionId, "therapist-refresh", created.therapistRefresh);
      savePanelSession(created);
      setSession(created);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create a secure session.");
    }
  };

  const invite = session
    ? `${window.location.origin}/session/${session.sessionId}${makeInviteFragment(session.clientCapability, getLiveSessionValue(session.sessionId, "key") ?? "")}`
    : "";

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(invite);
      setCopied(true);
    } catch {
      setError("Copy the invitation link manually.");
    }
  };

  const end = async () => {
    if (!session) return;
    const refreshSecret = getLiveSessionValue(session.sessionId, "therapist-refresh");
    if (!refreshSecret) return setError("This browser no longer holds the therapist session secret.");
    const response = await fetch(`/api/mindcanvas/sessions/${session.sessionId}/end`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ refreshSecret }) });
    if (!response.ok) return setError("Could not end the session.");
    clearLiveSession(session.sessionId);
    savePanelSession(null);
    setSession(null);
  };

  return (
    <section className="mt-8 max-w-xl rounded-3xl bg-card p-5 text-center shadow-soft">
      <h2 className="font-display text-2xl text-foreground">Remote session</h2>
      <p className="mt-2 text-sm text-muted-foreground">Create a one-time, encrypted invitation for your client.</p>
      {error && <p className="mt-3 text-sm text-destructive" role="alert">{error}</p>}
      {!session ? <button onClick={create} className="mt-4 min-h-11 rounded-full bg-primary px-5 font-semibold text-primary-foreground">Create Session</button> : (
        <div className="mt-4 space-y-3">
          <p className="text-sm text-muted-foreground">Expires {new Date(session.expiresAt).toLocaleString()}.</p>
          <label className="block text-left text-sm font-semibold text-foreground">Secure client invitation
            <textarea className="mt-1 min-h-20 w-full rounded-lg border border-input bg-background p-2 text-xs" readOnly value={invite} aria-label="Secure client invitation" />
          </label>
          <div className="flex flex-wrap justify-center gap-2">
            <Link to="/session/$sessionId" params={{ sessionId: session.sessionId }} search={{ role: "therapist" }} className="inline-flex min-h-11 items-center rounded-full bg-card px-4 text-sm font-semibold text-foreground shadow-soft">Open live view</Link>
            <button onClick={copy} className="min-h-11 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground">{copied ? "Copied" : "Copy Invitation"}</button>
            <button onClick={end} className="min-h-11 rounded-full bg-destructive px-4 text-sm font-semibold text-destructive-foreground">End Session</button>
          </div>
        </div>
      )}
    </section>
  );
}
