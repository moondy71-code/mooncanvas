import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { MindCanvasSessionService, SessionError, type SessionRepository, type StoredGrant, type StoredSession } from "./mindcanvas-sessions";

class MemoryRepository implements SessionRepository {
  sessions = new Map<string, StoredSession>();
  grants = new Map<string, StoredGrant>();
  key = (sessionId: string, role: string) => `${sessionId}:${role}`;
  async create(session: StoredSession, grant: StoredGrant) { this.sessions.set(session.id, session); this.grants.set(this.key(grant.sessionId, grant.role), grant); }
  async findSession(sessionId: string) { return this.sessions.get(sessionId) ?? null; }
  async redeemClient(sessionId: string, inviteHash: string, grant: StoredGrant) {
    const session = this.sessions.get(sessionId);
    if (!session || session.clientInviteHash !== inviteHash || this.grants.has(this.key(sessionId, "client"))) return false;
    this.grants.set(this.key(sessionId, "client"), grant); return true;
  }
  now = "2026-10-02T10:00:00.000Z";
  async rotateGrant(sessionId: string, role: "therapist" | "client", oldHash: string, nextGrant: StoredGrant) {
    const current = this.grants.get(this.key(sessionId, role));
    if (!current || current.refreshHash !== oldHash || current.revokedAt || current.expiresAt <= this.now || nextGrant.expiresAt > this.sessions.get(sessionId)!.expiresAt) return false;
    this.grants.set(this.key(sessionId, role), nextGrant); return true;
  }
  async end(sessionId: string, refreshHash: string) {
    const grant = this.grants.get(this.key(sessionId, "therapist")); const s = this.sessions.get(sessionId);
    if (!grant || !s || grant.refreshHash !== refreshHash || grant.expiresAt <= this.now) return false;
    this.sessions.set(sessionId, { ...s, endedAt: "2026-10-02T12:00:00.000Z" }); return true;
  }
  async cleanup(now: string) { let count = 0; for (const [id, session] of this.sessions) if (session.expiresAt <= now || session.endedAt) { this.sessions.delete(id); count++; } return count; }
}

const keys = generateKeyPairSync("ed25519");
const privateJwk = keys.privateKey.export({ format: "jwk" });
const service = (repo = new MemoryRepository(), now = new Date("2026-10-02T10:00:00.000Z")) => { repo.now = now.toISOString(); return new MindCanvasSessionService({
  repository: repo, invitationPepper: "test-pepper", privateJwk, now: () => now,
  random: (() => { let n = 0; return () => `capability-${String(++n).padStart(24, "0")}`; })(),
}); };

describe("MindCanvas session authority", () => {
  it("creates separate therapist/client capabilities and one-time client redemption", async () => {
    const repo = new MemoryRepository(); const sessions = service(repo); const created = await sessions.create();
    expect(created.therapistCapability).not.toBe(created.clientCapability);
    const client = await sessions.joinClient(created.sessionId, created.clientCapability);
    expect(client.token.split(".")).toHaveLength(3);
    await expect(sessions.joinClient(created.sessionId, created.clientCapability)).rejects.toMatchObject({ code: "redeemed" });
  });

  it("rotates refresh secrets and rejects an old secret", async () => {
    const sessions = service(); const created = await sessions.create();
    const refreshed = await sessions.refresh(created.sessionId, "therapist", created.therapistRefresh);
    await expect(sessions.refresh(created.sessionId, "therapist", created.therapistRefresh)).rejects.toMatchObject({ code: "unauthorized" });
    expect(refreshed.refreshSecret).not.toBe(created.therapistRefresh);
  });

  it("rejects expired sessions and terminates access", async () => {
    const repo = new MemoryRepository(); const created = await service(repo).create();
    const expired = service(repo, new Date("2026-10-02T19:00:00.000Z"));
    await expect(expired.refresh(created.sessionId, "therapist", created.therapistRefresh)).rejects.toBeInstanceOf(SessionError);
    const active = service(repo); await active.end(created.sessionId, created.therapistRefresh);
    await expect(active.refresh(created.sessionId, "therapist", created.therapistRefresh)).rejects.toMatchObject({ code: "ended" });
  });

  it("rejects an expired refresh grant and unauthorized session termination", async () => {
    const repo = new MemoryRepository(); const sessions = service(repo); const created = await sessions.create();
    const grant = repo.grants.get(repo.key(created.sessionId, "therapist"))!;
    repo.grants.set(repo.key(created.sessionId, "therapist"), { ...grant, expiresAt: "2026-10-02T09:59:59.000Z" });
    await expect(sessions.refresh(created.sessionId, "therapist", created.therapistRefresh)).rejects.toMatchObject({ code: "unauthorized" });
    await expect(sessions.end(created.sessionId, "wrong-secret")).rejects.toMatchObject({ code: "unauthorized" });
  });

  it("allows exactly one concurrent invitation redemption", async () => {
    const sessions = service(); const created = await sessions.create();
    const results = await Promise.allSettled([sessions.joinClient(created.sessionId, created.clientCapability), sessions.joinClient(created.sessionId, created.clientCapability)]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
  });

  it("never issues a relay token beyond the parent session expiry", async () => {
    const repo = new MemoryRepository();
    const shortLived = new MindCanvasSessionService({
      repository: repo, invitationPepper: "test-pepper", privateJwk, now: () => new Date("2026-10-02T10:00:00.000Z"),
      random: (() => { let n = 0; return () => `boundary-${String(++n).padStart(24, "0")}`; })(), sessionLifetimeMs: 30_000,
    });
    const created = await shortLived.create();
    const payload = JSON.parse(Buffer.from(created.token.split(".")[1]!, "base64url").toString()) as { exp: number };
    expect(payload.exp).toBe(Math.floor(new Date(created.expiresAt).getTime() / 1000));
  });
});
