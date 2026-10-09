export interface MoonCanvasDocument {
  id: string;
  name: string;
  persistenceKey: string;
  createdAt: string;
  updatedAt: string;
}

const KEY = "mooncanvas.documents.v1";
const LEGACY_DOCUMENT: MoonCanvasDocument = {
  id: "last",
  name: "Earlier drawing",
  persistenceKey: "mooncanvas",
  createdAt: "",
  updatedAt: "",
};

function read(): MoonCanvasDocument[] {
  try {
    const raw = localStorage.getItem(KEY);
    const documents = raw ? (JSON.parse(raw) as Partial<MoonCanvasDocument>[]) : [];
    if (!Array.isArray(documents) || !documents.length) return [LEGACY_DOCUMENT];
    return documents.map((document, index) => ({
      ...document,
      id: document.id ?? `legacy-${index}`,
      name: document.name?.trim() || (document.id === "last" ? "Earlier drawing" : `Drawing ${index + 1}`),
      persistenceKey: document.persistenceKey ?? "mooncanvas",
      createdAt: document.createdAt ?? "",
      updatedAt: document.updatedAt ?? "",
    }));
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

export function createDocument(name = "Untitled drawing") {
  const createdAt = new Date().toISOString();
  const id = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const document = {
    id,
    name,
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

export function renameDocument(id: string, name: string) {
  const nextName = name.trim();
  if (!nextName) return false;
  const documents = read();
  const index = documents.findIndex((document) => document.id === id);
  if (index < 0) return false;
  const current = documents[index]!;
  write([...documents.slice(0, index), { ...current, name: nextName }, ...documents.slice(index + 1)]);
  return true;
}

const TLDRAW_DATABASE_PREFIX = "TLDRAW_DOCUMENT_v2";

function request<T>(value: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    value.onsuccess = () => resolve(value.result);
    value.onerror = () => reject(value.error);
  });
}

function openDatabase(name: string, version?: number, stores: string[] = []) {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = version ? indexedDB.open(name, version) : indexedDB.open(name);
    request.onupgradeneeded = () => {
      for (const store of stores) {
        if (!request.result.objectStoreNames.contains(store)) request.result.createObjectStore(store);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function copyCanvasData(sourceKey: string, targetKey: string) {
  if (typeof indexedDB === "undefined") return;
  const source = await openDatabase(`${TLDRAW_DATABASE_PREFIX}${sourceKey}`);
  const stores = [...source.objectStoreNames];
  if (!stores.length) {
    source.close();
    return;
  }
  const sourceTransaction = source.transaction(stores, "readonly");
  const rows = await Promise.all(
    stores.map(async (store) => {
      const objectStore = sourceTransaction.objectStore(store);
      return { store, keys: await request(objectStore.getAllKeys()), values: await request(objectStore.getAll()) };
    }),
  );
  const target = await openDatabase(`${TLDRAW_DATABASE_PREFIX}${targetKey}`, source.version, stores);
  const targetTransaction = target.transaction(stores, "readwrite");
  for (const { store, keys, values } of rows) {
    const objectStore = targetTransaction.objectStore(store);
    values.forEach((value, index) => objectStore.put(value, keys[index]!));
  }
  await new Promise<void>((resolve, reject) => {
    targetTransaction.oncomplete = () => resolve();
    targetTransaction.onerror = () => reject(targetTransaction.error);
    targetTransaction.onabort = () => reject(targetTransaction.error);
  });
  source.close();
  target.close();
}

export async function duplicateDocument(source: MoonCanvasDocument) {
  const document = createDocument(`${source.name} copy`);
  try {
    await copyCanvasData(source.persistenceKey, document.persistenceKey);
    return document;
  } catch {
    // Keep the newly created blank document if a browser refuses database copying.
    return document;
  }
}

export async function deleteDocument(document: MoonCanvasDocument) {
  if (typeof indexedDB !== "undefined") {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase(`${TLDRAW_DATABASE_PREFIX}${document.persistenceKey}`);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error("Close other tabs before deleting this drawing."));
    });
  }
  write(read().filter((item) => item.id !== document.id));
}
