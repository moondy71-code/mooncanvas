import { createHmac, createPrivateKey, randomBytes, sign, type JsonWebKey as NodeJsonWebKey } from "node:crypto";

export type SessionRole = "therapist" | "client";

export interface StoredSession {
  id: string;
  expiresAt: string;
  endedAt: string | null;
  /** Present only while creating a session; never returned by the RPC status wrapper. */
  therapistInviteHash?: string;
  clientInviteHash?: string;
}

export interface StoredGrant {
  sessionId: string;
  role: SessionRole;
  refreshHash: string;
  expiresAt: string;
  revokedAt: string | null;
}

export interface SessionRepository {
  create(session: StoredSession, therapistGrant: StoredGrant): Promise<void>;
  findSession(sessionId: string): Promise<StoredSession | null>;
  redeemClient(sessionId: string, inviteHash: string, grant: StoredGrant): Promise<boolean>;
  rotateGrant(sessionId: string, role: SessionRole, oldHash: string, nextGrant: StoredGrant): Promise<boolean>;
  end(sessionId: string, therapistRefreshHash: string): Promise<boolean>;
  cleanup(now: string): Promise<number>;
}

export interface SessionServiceOptions {
  repository: SessionRepository;
  invitationPepper: string;
  privateJwk: NodeJsonWebKey;
  now?: () => Date;
  random?: (bytes: number) => string;
  sessionLifetimeMs?: number;
  tokenLifetimeSeconds?: number;
}

const TOKEN_ISSUER = "mindcanvas";
const TOKEN_AUDIENCE = "mindcanvas-relay";
const base64Url = (value: Buffer) => value.toString("base64url");
const jsonPart = (value: unknown) => base64Url(Buffer.from(JSON.stringify(value)));
const defaultRandom = (bytes: number) => randomBytes(bytes).toString("base64url");

function validId(value: string) {
  return /^[A-Za-z0-9_-]{22,128}$/.test(value);
}

export class SessionError extends Error {
  constructor(public readonly code: "invalid" | "expired" | "ended" | "unauthorized" | "redeemed") {
    super(code);
  }
}

/** Server-only session authority. Raw capabilities are returned once and only HMAC hashes are persisted. */
export class MindCanvasSessionService {
  private readonly now: () => Date;
  private readonly random: (bytes: number) => string;
  private readonly sessionLifetimeMs: number;
  private readonly tokenLifetimeSeconds: number;

  constructor(private readonly options: SessionServiceOptions) {
    this.now = options.now ?? (() => new Date());
    this.random = options.random ?? defaultRandom;
    // A consultation may survive normal mobile backgrounding/reconnection. It
    // still has a finite safety boundary if the therapist never explicitly ends it.
    this.sessionLifetimeMs = options.sessionLifetimeMs ?? 8 * 60 * 60 * 1000;
    this.tokenLifetimeSeconds = options.tokenLifetimeSeconds ?? 5 * 60;
  }

  async create() {
    const now = this.now();
    const sessionId = this.random(32);
    const therapistCapability = this.random(32);
    const clientCapability = this.random(32);
    const therapistRefresh = this.random(32);
    const expiresAt = new Date(now.getTime() + this.sessionLifetimeMs).toISOString();
    const session: StoredSession = {
      id: sessionId,
      expiresAt,
      endedAt: null,
      therapistInviteHash: this.hash(therapistCapability),
      clientInviteHash: this.hash(clientCapability),
    };
    await this.options.repository.create(session, this.grant(sessionId, "therapist", therapistRefresh, expiresAt));
    return {
      sessionId,
      expiresAt,
      therapistCapability,
      therapistRefresh,
      clientCapability,
      token: this.issueToken(sessionId, "therapist", now, expiresAt),
    };
  }

  async joinClient(sessionId: string, clientCapability: string) {
    const session = await this.activeSession(sessionId);
    const refreshSecret = this.random(32);
    const redeemed = await this.options.repository.redeemClient(sessionId, this.hash(clientCapability), this.grant(sessionId, "client", refreshSecret, session.expiresAt));
    if (!redeemed) throw new SessionError("redeemed");
    return { sessionId, expiresAt: session.expiresAt, refreshSecret, token: this.issueToken(sessionId, "client", this.now(), session.expiresAt) };
  }

  async refresh(sessionId: string, role: SessionRole, refreshSecret: string) {
    const session = await this.activeSession(sessionId);
    const nextSecret = this.random(32);
    const rotated = await this.options.repository.rotateGrant(
      sessionId,
      role,
      this.hash(refreshSecret),
      this.grant(sessionId, role, nextSecret, session.expiresAt),
    );
    if (!rotated) throw new SessionError("unauthorized");
    return { refreshSecret: nextSecret, token: this.issueToken(sessionId, role, this.now(), session.expiresAt), expiresAt: session.expiresAt };
  }

  async end(sessionId: string, therapistRefreshSecret: string) {
    const refreshed = await this.refresh(sessionId, "therapist", therapistRefreshSecret);
    if (!(await this.options.repository.end(sessionId, this.hash(refreshed.refreshSecret)))) throw new SessionError("unauthorized");
  }

  async cleanup() {
    return this.options.repository.cleanup(this.now().toISOString());
  }

  private async activeSession(sessionId: string) {
    if (!validId(sessionId)) throw new SessionError("invalid");
    const session = await this.options.repository.findSession(sessionId);
    if (!session) throw new SessionError("unauthorized");
    if (session.endedAt) throw new SessionError("ended");
    if (new Date(session.expiresAt).getTime() <= this.now().getTime()) throw new SessionError("expired");
    return session;
  }

  private hash(value: string) {
    return createHmac("sha256", this.options.invitationPepper).update(value).digest("base64url");
  }

  private grant(sessionId: string, role: SessionRole, refreshSecret: string, expiresAt: string): StoredGrant {
    return { sessionId, role, refreshHash: this.hash(refreshSecret), expiresAt, revokedAt: null };
  }

  private issueToken(sessionId: string, role: SessionRole, now: Date, sessionExpiresAt: string) {
    const iat = Math.floor(now.getTime() / 1000);
    const exp = Math.min(iat + this.tokenLifetimeSeconds, Math.floor(new Date(sessionExpiresAt).getTime() / 1000));
    const header = jsonPart({ alg: "EdDSA", typ: "JWT" });
    const claims = jsonPart({
      iss: TOKEN_ISSUER,
      aud: TOKEN_AUDIENCE,
      sessionId,
      role,
      iat,
      exp,
      jti: this.random(18),
    });
    const signature = sign(null, Buffer.from(`${header}.${claims}`), createPrivateKey({ key: this.options.privateJwk, format: "jwk" }));
    return `${header}.${claims}.${base64Url(signature)}`;
  }
}
