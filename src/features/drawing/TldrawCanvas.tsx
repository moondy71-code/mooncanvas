import { Tldraw, useEditor, useValue, type TLComponents } from "tldraw";
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
  const show = useValue(
    "a4",
    () => (editor.getInstanceState().meta as { a4?: boolean }).a4 ?? false,
    [editor],
  );
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
  return (
    <>
      <A4Guide />
      <SelectedShapesToFront />
    </>
  );
}

const components: TLComponents = {
  OnTheCanvas: MindCanvasOnTheCanvas,
  StylePanel: MindCanvasStylePanel,
};
export const drawingShapeUtils = [MindCanvasDrawShapeUtil];

export interface TldrawCanvasProps {
  showA4: boolean;
  /** Gives the page a handle to the engine (used by the recording controller). */
  onEditor?: (editor: Editor | null) => void;
}

export default function TldrawCanvas({ showA4, onEditor }: TldrawCanvasProps) {
  // tldraw validates this client-side production license. It is a public SDK
  // license key, supplied only through Vite's build environment.
  const licenseKey = import.meta.env["VITE_TLDRAW_LICENSE_KEY"] as string | undefined;

  return (
    <Tldraw
      components={components}
      shapeUtils={drawingShapeUtils}
      persistenceKey="mooncanvas"
      {...(licenseKey ? { licenseKey } : {})}
      onMount={(editor) => {
        editor.setCurrentTool("draw");
        editor.updateInstanceState({ meta: { a4: showA4 } });
        const stopCustomColorStamp = installCustomColorStamp(editor);
        (window as unknown as { __mcEditor?: unknown }).__mcEditor = editor;
        onEditor?.(editor);
        return () => {
          stopCustomColorStamp();
          onEditor?.(null);
        };
      }}
    >
      <A4Sync showA4={showA4} />
    </Tldraw>
  );
}

function A4Sync({ showA4 }: { showA4: boolean }) {
  const editor = useEditor();
  useEffect(() => {
    editor.updateInstanceState({ meta: { a4: showA4 } });
  }, [editor, showA4]);
  return null;
}
