import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(resolve(process.cwd(), "supabase/mindcanvas_sessions.sql"), "utf8");
const adapter = readFileSync(resolve(process.cwd(), "src/server/supabase-session-repository.ts"), "utf8");

const wrappers = [
  "create_session", "session_status", "redeem_client_invite", "rotate_grant", "end_session", "cleanup_sessions",
];

describe("MindCanvas public RPC wrapper contract", () => {
  it("keeps the private schema unexposed and grants each public wrapper only to service_role", () => {
    expect(sql).toContain("revoke all on schema mindcanvas from public, anon, authenticated, service_role");
    expect(sql).not.toContain("grant usage on schema mindcanvas");

    for (const name of wrappers) {
      expect(sql).toContain(`create function public.mindcanvas_api_${name}`);
      expect(sql).toContain(`revoke all on function public.mindcanvas_api_${name}`);
      expect(sql).toContain(`grant execute on function public.mindcanvas_api_${name}`);
    }
    expect(sql).not.toMatch(/grant execute on function public\.mindcanvas_api_[\s\S]*?to (?:anon|authenticated|public)/i);
  });

  it("returns only safe status data and forces the server adapter through the public wrappers", () => {
    const statusWrapper = sql.match(/create function public\.mindcanvas_api_session_status[\s\S]*?\$\$;/)?.[0] ?? "";
    expect(statusWrapper).toContain("select session.expires_at, session.ended_at");
    expect(statusWrapper).not.toMatch(/invite_hash|refresh_hash/i);
    expect(statusWrapper).toContain("security definer set search_path = pg_catalog");
    expect(adapter).not.toContain("/rest/v1/mindcanvas.");
    for (const name of wrappers) expect(adapter).toContain(`mindcanvas_api_${name}`);
  });
});
