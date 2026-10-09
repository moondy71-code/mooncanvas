import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Logo } from "@/components/Logo";
import { OfflineStatus } from "@/components/OfflineStatus";
import { PwaInstallPrompt } from "@/components/PwaInstallPrompt";
import {
  createDocument,
  deleteDocument,
  duplicateDocument,
  listDocuments,
  renameDocument,
  type MoonCanvasDocument,
} from "@/features/drawing/documents";

type DrawingModal = {
  mode: "rename" | "delete";
  document: MoonCanvasDocument;
  name?: string;
  error?: string;
};

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "MoonCanvas — Create under the moon" },
      {
        name: "description",
        content: "A private drawing space for creating under the moon.",
      },
      { property: "og:title", content: "MoonCanvas — Create under the moon" },
      {
        property: "og:description",
        content: "A private drawing space for creating under the moon.",
      },
    ],
  }),
  component: Home,
});

function Home() {
  const navigate = useNavigate();
  const [documents, setDocuments] = useState<MoonCanvasDocument[]>([]);
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const [modal, setModal] = useState<DrawingModal | null>(null);

  useEffect(() => setDocuments(listDocuments()), []);

  useEffect(() => {
    if (!modal) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setModal(null);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [modal]);

  const openDrawing = (document: MoonCanvasDocument) => {
    navigate({ to: "/draw", search: { document: document.id } });
  };

  const startNewDrawing = () => {
    const document = createDocument();
    setDocuments((current) => [document, ...current]);
    navigate({ to: "/draw", search: { document: document.id } });
  };

  const confirmRename = () => {
    if (!modal || modal.mode !== "rename" || !modal.name || !renameDocument(modal.document.id, modal.name)) return;
    setDocuments(listDocuments());
    setModal(null);
  };

  const duplicateDrawing = async (document: MoonCanvasDocument) => {
    const duplicate = await duplicateDocument(document);
    setDocuments(listDocuments());
    setActiveMenuId(null);
    openDrawing(duplicate);
  };

  const confirmDelete = async () => {
    if (!modal || modal.mode !== "delete") return;
    try {
      await deleteDocument(modal.document);
      setDocuments(listDocuments());
      setModal(null);
    } catch {
      setModal((current) => current ? { ...current, error: "Close any other MoonCanvas tabs and try again." } : null);
    }
  };

  const openRenameModal = (document: MoonCanvasDocument) => {
    setActiveMenuId(null);
    setModal({ mode: "rename", document, name: document.name });
  };

  const openDeleteModal = (document: MoonCanvasDocument) => {
    setActiveMenuId(null);
    setModal({ mode: "delete", document });
  };

  return (
    <main className="moon-shell relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-6 py-16 text-center">
      <div className="moon-orbit absolute size-[min(94vw,38rem)] rounded-full" aria-hidden="true" />
      <div className="relative flex flex-col items-center">
        <Logo size={88} />
        <div className="mt-4">
          <OfflineStatus />
        </div>
        <p className="moon-kicker mt-7 text-xs font-bold">Create under the moon.</p>
        <h1 className="mt-3 font-display text-5xl text-foreground sm:text-6xl">MoonCanvas</h1>
        <p className="mt-4 max-w-md text-lg text-muted-foreground">
          A warm, private space for ideas, sketches, and moments of calm.
        </p>
        <button
          type="button"
          onClick={startNewDrawing}
          className="mt-10 inline-flex min-h-14 items-center justify-center rounded-full bg-primary px-10 text-lg font-bold text-primary-foreground shadow-soft transition-transform hover:scale-[1.02]"
        >
          Start a new drawing
        </button>
        <section className="moon-drawing-list mt-7 w-full max-w-md text-left" aria-labelledby="your-drawings-heading">
          <div className="flex items-baseline justify-between gap-4 px-1">
            <h2 id="your-drawings-heading" className="font-display text-2xl text-foreground">
              Your drawings
            </h2>
            <span className="text-xs font-semibold text-muted-foreground">Stored on this device</span>
          </div>
          <div className="mt-3 grid gap-2">
            {documents.map((document) => (
              <div key={document.id} className="moon-drawing-card flex min-h-14 flex-wrap items-center gap-2 rounded-2xl px-4 py-3 text-left">
                <button type="button" onClick={() => openDrawing(document)} className="min-w-0 flex-1 text-left">
                  <span className="block truncate font-semibold text-foreground">{document.name}</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {document.updatedAt ? `Last opened ${formatDocumentDate(document.updatedAt)}` : "Saved on this device"}
                  </span>
                </button>
                <button
                  type="button"
                  className="moon-drawing-menu-button"
                  aria-label={`Options for ${document.name}`}
                  aria-expanded={activeMenuId === document.id}
                  aria-controls={`drawing-options-${document.id}`}
                  onClick={() => setActiveMenuId((current) => (current === document.id ? null : document.id))}
                >
                  ⋮
                </button>
                {activeMenuId === document.id ? (
                  <div id={`drawing-options-${document.id}`} className="moon-drawing-menu" role="menu" aria-label={`Options for ${document.name}`}>
                    <button type="button" role="menuitem" onClick={() => openRenameModal(document)}>Rename</button>
                    <button type="button" role="menuitem" onClick={() => void duplicateDrawing(document)}>Duplicate</button>
                    <button type="button" role="menuitem" className="is-danger" onClick={() => openDeleteModal(document)}>Delete</button>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </section>
        <PwaInstallPrompt />
        <Link
          to="/playback"
          className="moon-secondary-button mt-7 inline-flex min-h-11 items-center rounded-full px-6 text-sm font-semibold shadow-soft"
        >
          Open recording
        </Link>
      </div>
      {modal ? (
        <div className="moon-modal-backdrop" role="presentation" onMouseDown={() => setModal(null)}>
          <div className="moon-modal" role="dialog" aria-modal="true" aria-labelledby="drawing-modal-title" onMouseDown={(event) => event.stopPropagation()}>
            {modal.mode === "rename" ? (
              <form onSubmit={(event) => { event.preventDefault(); confirmRename(); }}>
                <h2 id="drawing-modal-title" className="font-display text-2xl text-foreground">Rename drawing</h2>
                <label className="sr-only" htmlFor="drawing-name">Drawing name</label>
                <input id="drawing-name" className="moon-modal-input mt-5" autoFocus value={modal.name ?? ""} onChange={(event) => setModal({ ...modal, name: event.target.value })} />
                <div className="mt-5 flex justify-end gap-3">
                  <button type="button" className="moon-modal-cancel" onClick={() => setModal(null)}>Cancel</button>
                  <button type="submit" className="moon-modal-primary">Save</button>
                </div>
              </form>
            ) : null}
            {modal.mode === "delete" ? (
              <>
                <h2 id="drawing-modal-title" className="font-display text-2xl text-foreground">Delete drawing?</h2>
                <p className="mt-2 text-sm text-muted-foreground">This cannot be undone.</p>
                {modal.error ? <p className="mt-2 text-sm text-[#ffb7bb]">{modal.error}</p> : null}
                <div className="mt-5 flex justify-end gap-3">
                  <button type="button" className="moon-modal-cancel" onClick={() => setModal(null)}>Cancel</button>
                  <button type="button" className="moon-modal-danger" onClick={() => void confirmDelete()}>Delete</button>
                </div>
              </>
            ) : null}
          </div>
        </div>
      ) : null}
      <p className="absolute inset-x-0 bottom-[max(1.25rem,env(safe-area-inset-bottom))] px-6 text-xs font-semibold tracking-wide text-muted-foreground/75">
        Created by moondy712016@gmail.com
      </p>
    </main>
  );
}

function formatDocumentDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? "recently"
    : new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}
