export type RelayRole = "therapist" | "client";

export interface SessionTokenClaims {
  iss: "mindcanvas";
  aud: "mindcanvas-relay";
  sessionId: string;
  role: RelayRole;
  exp: number;
  iat: number;
  jti: string;
}

const encoder = new TextEncoder();

function decodeBase64Url(value: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;
  try {
    const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (value.length % 4)) % 4);
    return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
  } catch {
    return null;
  }
}

function decodeJson(value: string): Record<string, unknown> | null {
  const bytes = decodeBase64Url(value);
  if (!bytes) return null;
  try {
    const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));
    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function validClaims(value: Record<string, unknown>, expectedSessionId: string, nowSeconds: number): value is Record<string, unknown> & SessionTokenClaims {
  return (
    value["iss"] === "mindcanvas" &&
    value["aud"] === "mindcanvas-relay" &&
    value["sessionId"] === expectedSessionId &&
    (value["role"] === "therapist" || value["role"] === "client") &&
    typeof value["exp"] === "number" &&
    Number.isInteger(value["exp"]) &&
    value["exp"] > nowSeconds &&
    typeof value["iat"] === "number" &&
    Number.isInteger(value["iat"]) &&
    typeof value["jti"] === "string" &&
    value["jti"].length >= 16
  );
}

/** Verifies an Ed25519 JWT issued by the Vercel authorization service. */
export async function validateSessionToken(
  token: string,
  publicJwk: JsonWebKey,
  expectedSessionId: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<SessionTokenClaims | null> {
  const parts = token.split(".");
  if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) return null;
  const header = decodeJson(parts[0]);
  const claims = decodeJson(parts[1]);
  const signature = decodeBase64Url(parts[2]);
  if (!header || !claims || !signature || header["alg"] !== "EdDSA" || header["typ"] !== "JWT" || !validClaims(claims, expectedSessionId, nowSeconds)) {
    return null;
  }
  try {
    const key = await crypto.subtle.importKey("jwk", publicJwk, { name: "Ed25519" }, false, ["verify"]);
    const signed = encoder.encode(`${parts[0]}.${parts[1]}`);
    const signatureBuffer = Uint8Array.from(signature).buffer;
    return (await crypto.subtle.verify({ name: "Ed25519" }, key, signatureBuffer, signed)) ? claims : null;
  } catch {
    return null;
  }
}
