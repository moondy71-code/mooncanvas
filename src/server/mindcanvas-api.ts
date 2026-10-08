import { MindCanvasSessionService, SessionError } from "./mindcanvas-sessions.js";
import { SupabaseSessionRepository } from "./supabase-session-repository.js";

export type MindCanvasApiEnvironment = {
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  MINDCANVAS_SESSION_PEPPER?: string;
  MINDCANVAS_TOKEN_PRIVATE_JWK?: string;
  MINDCANVAS_CRON_SECRET?: string;
};

export const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "cache-control": "no-store" } });

export function createSessionService(environment: MindCanvasApiEnvironment) {
  if (!environment.SUPABASE_URL || !environment.SUPABASE_SERVICE_ROLE_KEY || !environment.MINDCANVAS_SESSION_PEPPER || !environment.MINDCANVAS_TOKEN_PRIVATE_JWK) {
    throw new Error("not-configured");
  }

  return new MindCanvasSessionService({
    repository: new SupabaseSessionRepository({ url: environment.SUPABASE_URL, serviceRoleKey: environment.SUPABASE_SERVICE_ROLE_KEY }),
    invitationPepper: environment.MINDCANVAS_SESSION_PEPPER,
    privateJwk: JSON.parse(environment.MINDCANVAS_TOKEN_PRIVATE_JWK) as import("node:crypto").JsonWebKey,
  });
}

export async function requestBody(request: Request): Promise<Record<string, unknown>> {
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > 8192) throw new SessionError("invalid");
  const value: unknown = await request.json();
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new SessionError("invalid");
  return value as Record<string, unknown>;
}

export function sessionErrorResponse(error: unknown) {
  if (error instanceof SessionError) {
    const status = error.code === "invalid" ? 400 : error.code === "unauthorized" ? 401 : error.code === "redeemed" ? 409 : 410;
    return json({ error: error.code }, status);
  }
  return json({ error: "session-service-unavailable" }, 503);
}
