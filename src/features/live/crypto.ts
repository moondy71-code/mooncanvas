const encoder = new TextEncoder();
const decoder = new TextDecoder();
const toBuffer = (bytes: Uint8Array): ArrayBuffer => {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
};

export interface EncryptedLivePayload {
  iv: string;
  ciphertext: string;
}

const toBase64Url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");

function fromBase64Url(value: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;
  try {
    const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (value.length % 4)) % 4);
    return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
  } catch {
    return null;
  }
}

/** Creates a 256-bit AES-GCM session key. Keep its encoded form only in a URL fragment or local browser storage. */
export async function createSessionEncryptionKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
}

export async function exportSessionEncryptionKey(key: CryptoKey): Promise<string> {
  return toBase64Url(new Uint8Array(await crypto.subtle.exportKey("raw", key)));
}

export async function importSessionEncryptionKey(encoded: string): Promise<CryptoKey | null> {
  const raw = fromBase64Url(encoded);
  if (!raw || raw.byteLength !== 32) return null;
  return crypto.subtle.importKey("raw", toBuffer(raw), { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

export async function encryptLivePayload(key: CryptoKey, plaintext: unknown, associatedData: string): Promise<EncryptedLivePayload> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: toBuffer(iv), additionalData: toBuffer(encoder.encode(associatedData)) },
    key,
    encoder.encode(JSON.stringify(plaintext)),
  );
  return { iv: toBase64Url(iv), ciphertext: toBase64Url(new Uint8Array(encrypted)) };
}

export async function decryptLivePayload(key: CryptoKey, payload: EncryptedLivePayload, associatedData: string): Promise<unknown | null> {
  const iv = fromBase64Url(payload.iv);
  const ciphertext = fromBase64Url(payload.ciphertext);
  if (!iv || iv.byteLength !== 12 || !ciphertext) return null;
  try {
    return JSON.parse(
      decoder.decode(
        await crypto.subtle.decrypt(
          { name: "AES-GCM", iv: toBuffer(iv), additionalData: toBuffer(encoder.encode(associatedData)) },
          key,
          toBuffer(ciphertext),
        ),
      ),
    );
  } catch {
    return null;
  }
}

/** Capability and key stay in the fragment, which browsers do not send in HTTP or WebSocket requests. */
export function makeInviteFragment(capability: string, encryptionKey: string): string {
  return `#mc_invite=${encodeURIComponent(capability)}&mc_key=${encodeURIComponent(encryptionKey)}`;
}
