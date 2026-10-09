export interface MoonCanvasDocument {
  id: string;
  persistenceKey: string;
  createdAt: string;
  updatedAt: string;
}

const KEY = "mooncanvas.documents.v1";
const LEGACY_DOCUMENT: MoonCanvasDocument = {
  id: "last",
  persistenceKey: "mooncanvas",
  createdAt: "",
  updatedAt: "",
};

function read(): MoonCanvasDocument[] {
  try {
    const raw = localStorage.getItem(KEY);
    const documents = raw ? (JSON.parse(raw) as MoonCanvasDocument[]) : [];
    return Array.isArray(documents) && documents.length ? documents : [LEGACY_DOCUMENT];
  } catch {
    return [LEGACY_DOCUMENT];
  }
}

function write(documents: MoonCanvasDocument[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(documents));
  } catch {
    // Canvas persistence continues even when this small index cannot be written.
  }
}

export function getLastDocument() {
  return read().at(-1) ?? LEGACY_DOCUMENT;
}

/** Returns the browser-local drawings with the most recently opened first. */
export function listDocuments() {
  return read().toReversed();
}

export function createDocument() {
  const createdAt = new Date().toISOString();
  const id = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const document = {
    id,
    persistenceKey: `mooncanvas-document-${id}`,
    createdAt,
    updatedAt: createdAt,
  } satisfies MoonCanvasDocument;
  const documents = read();
  write([...documents, document]);
  return document;
}

export function getDocument(id?: string) {
  if (!id) return getLastDocument();
  return read().find((document) => document.id === id) ?? getLastDocument();
}

export function touchDocument(id: string) {
  const documents = read();
  const index = documents.findIndex((document) => document.id === id);
  if (index < 0) return;
  const current = documents[index]!;
  const updated = { ...current, updatedAt: new Date().toISOString() };
  write([...documents.slice(0, index), ...documents.slice(index + 1), updated]);
}
