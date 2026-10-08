import { DefaultNavigationPanel, Tldraw, useEditor, useValue, type TLComponents } from "tldraw";
import "tldraw/tldraw.css";
import { useEffect } from "react";
import type { Editor } from "tldraw";
import { MindCanvasStylePanel } from "./CustomColorPicker";
import { MindCanvasDrawShapeUtil, installCustomColorStamp } from "./customColor";

// A4 portrait in page units (210 x 297 mm scaled)
const A4_W = 794;
const A4_H = 1123;

function A4Guide() {
  const editor = useEditor();
  const show = useValue("a4", () => (editor.getInstanceState().meta as { a4?: boolean }).a4 ?? false, [editor]);
  if (!show) return null;
  return (
    <div
      className="a4-guide"
      style={{ width: A4_W, height: A4_H, transform: `translate(${-A4_W / 2}px, ${-A4_H / 2}px)` }}
      aria-hidden
    />
  );
}

/** Put the last selected object above its peers. */
function SelectedShapesToFront() {
  const editor = useEditor();
  const selectedIds = useValue("selected shapes", () => editor.getSelectedShapeIds(), [editor]);
  useEffect(() => {
    if (selectedIds.length) editor.bringToFront(selectedIds);
  }, [editor, selectedIds]);
  return null;
}

function MindCanvasOnTheCanvas() {
  return <><A4Guide /><SelectedShapesToFront /></>;
}

const components: TLComponents = { OnTheCanvas: MindCanvasOnTheCanvas, StylePanel: MindCanvasStylePanel };
/** Therapist-only observer UI: navigation remains, all editing controls are absent. */
const observerComponents: TLComponents = {
  ...components,
  ActionsMenu: null,
  ContextMenu: null,
  HelpMenu: null,
  MainMenu: null,
  Minimap: null,
  PageMenu: null,
  StylePanel: null,
  Toolbar: null,
  RichTextToolbar: null,
  ImageToolbar: null,
  VideoToolbar: null,
  KeyboardShortcutsDialog: null,
  QuickActions: null,
  HelperButtons: null,
  MenuPanel: null,
  TopPanel: null,
  SharePanel: null,
  NavigationPanel: DefaultNavigationPanel,
};
export const drawingShapeUtils = [MindCanvasDrawShapeUtil];

export interface TldrawCanvasProps {
  showA4: boolean;
  /** Enables pan and zoom while disabling all drawing/editing actions. */
  readOnly?: boolean;
  /** Gives the page a handle to the engine (used by the recording controller). */
  onEditor?: (editor: Editor | null) => void;
}

export default function TldrawCanvas({ showA4, readOnly = false, onEditor }: TldrawCanvasProps) {
  // tldraw validates this client-side production license. It is a public SDK
  // license key, supplied only through Vite's build environment.
  const licenseKey = import.meta.env["VITE_TLDRAW_LICENSE_KEY"] as string | undefined;

  return (
    <Tldraw
      components={readOnly ? observerComponents : components}
      shapeUtils={drawingShapeUtils}
      persistenceKey="mooncanvas"
      {...(licenseKey ? { licenseKey } : {})}
      onMount={(editor) => {
        editor.setCurrentTool(readOnly ? "hand" : "draw");
        editor.updateInstanceState({ isReadonly: readOnly, meta: { a4: showA4 } });
        const stopCustomColorStamp = installCustomColorStamp(editor);
        (window as unknown as { __mcEditor?: unknown }).__mcEditor = editor;
        onEditor?.(editor);
        return () => { stopCustomColorStamp(); onEditor?.(null); };
      }}
    >
      <A4Sync showA4={showA4} readOnly={readOnly} />
    </Tldraw>
  );
}

function A4Sync({ showA4, readOnly }: { showA4: boolean; readOnly: boolean }) {
  const editor = useEditor();
  useEffect(() => {
    editor.updateInstanceState({ isReadonly: readOnly, meta: { a4: showA4 } });
  }, [editor, readOnly, showA4]);
  return null;
}
