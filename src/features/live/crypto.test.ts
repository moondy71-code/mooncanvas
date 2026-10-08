import { webcrypto } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import {
  createSessionEncryptionKey,
  decryptLivePayload,
  encryptLivePayload,
  exportSessionEncryptionKey,
  importSessionEncryptionKey,
  makeInviteFragment,
} from "./crypto";

beforeAll(() => Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true }));

describe("live-session encryption", () => {
  it("round-trips an AES-GCM payload only with the matching associated data", async () => {
    const key = await createSessionEncryptionKey();
    const encrypted = await encryptLivePayload(key, { changes: { added: ["shape:1"] } }, "session:1:client:4:diff");
    await expect(decryptLivePayload(key, encrypted, "session:1:client:4:diff")).resolves.toEqual({ changes: { added: ["shape:1"] } });
    await expect(decryptLivePayload(key, encrypted, "session:1:therapist:4:diff")).resolves.toBeNull();
  });

  it("exports a 256-bit fragment-safe key without putting it in request URLs", async () => {
    const key = await createSessionEncryptionKey();
    const encoded = await exportSessionEncryptionKey(key);
    expect((await importSessionEncryptionKey(encoded))).not.toBeNull();
    expect(makeInviteFragment("capability", encoded)).toMatch(/^#mc_invite=/);
    await expect(importSessionEncryptionKey("not-a-key")).resolves.toBeNull();
  });
});
