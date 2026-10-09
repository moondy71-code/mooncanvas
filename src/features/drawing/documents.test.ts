import { afterEach, describe, expect, it } from "vitest";
import { createDocument, getDocument, getLastDocument, touchDocument } from "./documents";

afterEach(() => localStorage.clear());

describe("drawing documents", () => {
  it("keeps the existing MoonCanvas canvas as the first document", () => {
    expect(getLastDocument()).toMatchObject({ id: "last", persistenceKey: "mooncanvas" });
  });

  it("creates a separate persistence key for a new drawing", () => {
    const document = createDocument();
    expect(document.persistenceKey).toMatch(/^mooncanvas-document-/);
    expect(getDocument(document.id)).toEqual(document);
  });

  it("moves the opened document to the recent position", () => {
    const first = createDocument();
    const second = createDocument();
    touchDocument(first.id);
    expect(getLastDocument().id).toBe(first.id);
    expect(getDocument(second.id)).toEqual(second);
  });
});
