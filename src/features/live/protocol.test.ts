import { describe, expect, it } from "vitest";
import {
  LIVE_PROTOCOL_VERSION,
  MAX_LIVE_MESSAGE_BYTES,
  RecordingTransferAssembler,
  SequenceGate,
  canSendLiveMessage,
  parseLiveMessage,
  type LiveEnvelope,
  type RecordingTransferStart,
} from "./protocol";

const sessionId = "a3xY0xRjKaTnPq7Vm2Lw9Z";
const base = <T extends LiveEnvelope["type"]>(type: T, sender: LiveEnvelope["sender"], payload: LiveEnvelope<T>["payload"], sequence = 1): LiveEnvelope<T> => ({
  version: LIVE_PROTOCOL_VERSION,
  sessionId,
  sender,
  sequence,
  type,
  payload,
});

describe("live protocol validation and authorization", () => {
  it("accepts a bounded client document diff", () => {
    const message = base("diff", "client", { changes: { added: { "shape:1": { id: "shape:1" } } } });
    expect(parseLiveMessage(message)).toEqual(message);
    expect(canSendLiveMessage("client", message)).toBe(true);
  });

  it("rejects therapist drawing changes and malformed or oversized messages", () => {
    const therapistDiff = base("diff", "therapist", { changes: {} });
    expect(canSendLiveMessage("therapist", therapistDiff)).toBe(false);
    expect(parseLiveMessage({ ...therapistDiff, version: 99 })).toBeNull();
    expect(parseLiveMessage({ ...base("diff", "client", { changes: "x".repeat(MAX_LIVE_MESSAGE_BYTES) }) })).toBeNull();
  });

  it("allows only the therapist to request recovery snapshots", () => {
    const request = base("snapshot-request", "therapist", { afterSequence: 4 });
    expect(canSendLiveMessage("therapist", request)).toBe(true);
    expect(canSendLiveMessage("client", request)).toBe(false);
  });

  it("allows only the client to grant or withdraw recording consent", () => {
    const consent = base("recording-consent", "client", { granted: true, at: "2026-10-05T12:00:00.000Z" });
    expect(parseLiveMessage(consent)).toEqual(consent);
    expect(canSendLiveMessage("client", consent)).toBe(true);
    expect(canSendLiveMessage("therapist", consent)).toBe(false);
  });

  it("allows only the client to announce the active drawing page", () => {
    const pageChange = base("page-change", "client", { pageId: "page:two" });
    expect(parseLiveMessage(pageChange)).toEqual(pageChange);
    expect(canSendLiveMessage("client", pageChange)).toBe(true);
    expect(canSendLiveMessage("therapist", pageChange)).toBe(false);
  });

  it("detects duplicate and missing sequences", () => {
    const gate = new SequenceGate();
    expect(gate.accept(base("diff", "client", { changes: {} }, 4))).toBe("accepted");
    expect(gate.accept(base("diff", "client", { changes: {} }, 4))).toBe("replay");
    expect(gate.accept(base("diff", "client", { changes: {} }, 6))).toBe("gap");
    expect(gate.accept(base("diff", "client", { changes: {} }, 7))).toBe("accepted");
  });
});

describe("recording transfer", () => {
  const start: RecordingTransferStart = {
    transferId: "recording-01",
    startedAt: "2026-10-02T14:00:00.000Z",
    engine: { name: "tldraw", version: "5.5.0" },
    initialRecords: [{ id: "shape:initial" }],
  };
  const first = { transferId: start.transferId, index: 0, events: [{ type: "undo", t: 10 } as const] };
  const second = { transferId: start.transferId, index: 1, events: [{ type: "redo", t: 20 } as const] };

  it("reassembles out-of-order chunks exactly once", () => {
    const receiver = new RecordingTransferAssembler(start);
    expect(receiver.addChunk(second)).toBe("added");
    expect(receiver.setComplete({ transferId: start.transferId, totalChunks: 2, durationMs: 30, complete: true })).toBe(true);
    expect(receiver.build()).toBeNull();
    expect(receiver.missing()).toEqual([0]);
    expect(receiver.addChunk(first)).toBe("added");
    expect(receiver.addChunk(first)).toBe("duplicate");
    expect(receiver.build()).toMatchObject({ format: "mindcanvas.recording", version: 1, complete: true, events: [...first.events, ...second.events] });
  });

  it("rejects conflicting duplicate chunks and a different transfer", () => {
    const receiver = new RecordingTransferAssembler(start);
    receiver.addChunk(first);
    expect(receiver.addChunk({ ...first, events: [{ type: "redo", t: 10 }] })).toBe("conflict");
    expect(receiver.addChunk({ ...first, transferId: "other" })).toBe("invalid");
  });
});
