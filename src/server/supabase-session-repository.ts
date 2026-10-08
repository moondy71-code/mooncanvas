import type { SessionRepository, SessionRole, StoredGrant, StoredSession } from "./mindcanvas-sessions.js";

type SupabaseEnv = { url: string; serviceRoleKey: string };

/** Server-only adapter. It calls only tightly scoped public RPC wrappers, never private-schema tables. */
export class SupabaseSessionRepository implements SessionRepository {
  constructor(private readonly env: SupabaseEnv) {}

  async create(session: StoredSession, therapistGrant: StoredGrant) {
    await this.rpc("mindcanvas_api_create_session", {
      p_id: session.id, p_expires_at: session.expiresAt, p_therapist_invite_hash: session.therapistInviteHash,
      p_client_invite_hash: session.clientInviteHash, p_therapist_refresh_hash: therapistGrant.refreshHash,
    });
  }

  async findSession(sessionId: string): Promise<StoredSession | null> {
    const rows = (await this.rpc("mindcanvas_api_session_status", { p_session_id: sessionId })) as Array<Record<string, unknown>> | null;
    const row = rows?.[0];
    if (!row) return null;
    return {
      id: sessionId, expiresAt: String(row["expires_at"]), endedAt: row["ended_at"] === null ? null : String(row["ended_at"]),
    };
  }

  async redeemClient(sessionId: string, inviteHash: string, grant: StoredGrant) {
    return Boolean(await this.rpc("mindcanvas_api_redeem_client_invite", { p_session_id: sessionId, p_invite_hash: inviteHash, p_refresh_hash: grant.refreshHash, p_expires_at: grant.expiresAt }));
  }

  async rotateGrant(sessionId: string, role: SessionRole, oldHash: string, nextGrant: StoredGrant) {
    return Boolean(await this.rpc("mindcanvas_api_rotate_grant", { p_session_id: sessionId, p_role: role, p_old_refresh_hash: oldHash, p_next_refresh_hash: nextGrant.refreshHash, p_expires_at: nextGrant.expiresAt }));
  }

  async end(sessionId: string, therapistRefreshHash: string) { return Boolean(await this.rpc("mindcanvas_api_end_session", { p_session_id: sessionId, p_therapist_refresh_hash: therapistRefreshHash })); }
  async cleanup(now: string) { return Number(await this.rpc("mindcanvas_api_cleanup_sessions", { p_now: now })); }

  private async rpc(name: string, body: Record<string, unknown>) {
    const response = await fetch(`${this.env.url}/rest/v1/rpc/${name}`, { method: "POST", headers: { ...this.headers(), "content-type": "application/json" }, body: JSON.stringify(body) });
    if (!response.ok) throw new Error(`MindCanvas RPC ${name} failed`);
    if (response.status === 204) return null;
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  }

  private headers() { return { apikey: this.env.serviceRoleKey, authorization: `Bearer ${this.env.serviceRoleKey}` }; }
}
