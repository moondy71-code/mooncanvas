import { webcrypto } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { LIVE_PROTOCOL_VERSION, MAX_LIVE_MESSAGE_BYTES, type LiveEnvelope } from "../../src/features/live/protocol";
import { ConnectionRegistry, validateRelayMessage } from "./relay-core";
import { validateSessionToken } from "./token";

const sessionId = "a3xY0xRjKaTnPq7Vm2Lw9Z";
const toBase64Url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
const jwtPart = (value: unknown) => toBase64Url(new TextEncoder().encode(JSON.stringify(value)));

beforeAll(() => Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true }));

async function signedToken(overrides: Record<string, unknown> = {}) {
  const pair = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);
  const header = jwtPart({ alg: "EdDSA", typ: "JWT" });
  const claims = jwtPart({
    iss: "mindcanvas",
    aud: "mindcanvas-relay",
    sessionId,
    role: "client",
    iat: 1_700_000_000,
    exp: 1_900_000_000,
    jti: "token-id-at-least-16",
    ...overrides,
  });
  const signature = await crypto.subtle.sign({ name: "Ed25519" }, pair.privateKey, new TextEncoder().encode(`${header}.${claims}`));
  return {
    token: `${header}.${claims}.${toBase64Url(new Uint8Array(signature))}`,
    publicJwk: await crypto.subtle.exportKey("jwk", pair.publicKey),
  };
}

const message = <T extends LiveEnvelope["type"]>(type: T, sender: LiveEnvelope["sender"], payload: LiveEnvelope<T>["payload"], sequence: number): LiveEnvelope<T> => ({
  version: LIVE_PROTOCOL_VERSION,
  sessionId,
  sender,
  type,
  payload,
  sequence,
});

describe("relay authentication", () => {
  it("accepts a valid Ed25519 MindCanvas session token", async () => {
    const { token, publicJwk } = await signedToken();
    await expect(validateSessionToken(token, publicJwk, sessionId, 1_800_000_000)).resolves.toMatchObject({ role: "client", sessionId });
  });

  it("rejects expired, wrong-session, and tampered tokens", async () => {
    const expired = await signedToken({ exp: 1 });
    await expect(validateSessionToken(expired.token, expired.publicJwk, sessionId, 2)).resolves.toBeNull();
    const valid = await signedToken();
    await expect(validateSessionToken(valid.token, valid.publicJwk, "another-session", 1_800_000_000)).resolves.toBeNull();
    await expect(validateSessionToken(`${valid.token}x`, valid.publicJwk, sessionId, 1_800_000_000)).resolves.toBeNull();
  });
});

describe("relay permissions and recovery", () => {
  it("rejects therapist drawing messages and oversized input", () => {
    const therapistDiff = JSON.stringify(message("diff", "therapist", { changes: {} }, 0));
    expect(validateRelayMessage("therapist", sessionId, therapistDiff, null)).toEqual({ status: "rejected" });
    const oversized = JSON.stringify(message("diff", "client", { changes: "x".repeat(MAX_LIVE_MESSAGE_BYTES) }, 0));
    expect(validateRelayMessage("client", sessionId, oversized, null)).toEqual({ status: "rejected" });
  });

  it("rejects replay, signals a sequence gap, and accepts a recovery snapshot", () => {
    const diff = JSON.stringify(message("diff", "client", { changes: {} }, 3));
    expect(validateRelayMessage("client", sessionId, diff, 3)).toEqual({ status: "replay" });
    const gap = JSON.stringify(message("diff", "client", { changes: {} }, 5));
    expect(validateRelayMessage("client", sessionId, gap, 3)).toEqual({ status: "gap", expectedSequence: 4 });
    const snapshot = JSON.stringify(message("snapshot", "client", { records: [], lastSequence: 5 }, 4));
    expect(validateRelayMessage("client", sessionId, snapshot, 3)).toMatchObject({ status: "accepted", nextSequence: 4 });
  });

  it("replaces a stale role socket on reconnect and rejects every socket after termination", () => {
    const registry = new ConnectionRegistry();
    expect(registry.connect("client", "old")).toEqual({ accepted: true });
    expect(registry.connect("client", "new")).toEqual({ accepted: true, replaced: "old" });
    expect(registry.isConnected("client")).toBe(true);
    registry.terminate();
    expect(registry.isConnected("client")).toBe(false);
    expect(registry.connect("therapist", "later")).toEqual({ accepted: false });
  });
});
