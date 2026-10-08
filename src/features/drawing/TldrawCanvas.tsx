import { Tldraw, useEditor, useValue, type TLComponents } from "tldraw";
import "tldraw/tldraw.css";
import { useEffect } from "react";
import type { Editor } from "tldraw";
import { MindCanvasStylePanel } from "./CustomColorPicker";
import { MindCanvasDrawShapeUtil, installCustomColorStamp } from "./customColor";
import { getGroupControlState } from "./groupControls";

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

function GroupControls() {
  const editor = useEditor();
  const selectedShapes = useValue(
    "selected shapes for grouping",
    () => editor.getSelectedShapes(),
    [editor],
  );
  const { canGroup, canUngroup } = getGroupControlState(selectedShapes);

  if (!selectedShapes.length) return null;

  return (
    <div className="mc-group-controls" role="toolbar" aria-label="Selection editing">
      <button
        type="button"
        disabled={!canGroup}
        onClick={() => editor.groupShapes(selectedShapes.map((shape) => shape.id))}
        title="Group selected items"
      >
        Group <span lang="ko">묶기</span>
      </button>
      <button
        type="button"
        disabled={!canUngroup}
        onClick={() =>
          editor.ungroupShapes(
            selectedShapes.filter((shape) => shape.type === "group").map((shape) => shape.id),
          )
        }
        title="Ungroup selected items"
      >
        Ungroup <span lang="ko">풀기</span>
      </button>
    </div>
  );
}

const components: TLComponents = {
  OnTheCanvas: MindCanvasOnTheCanvas,
  InFrontOfTheCanvas: GroupControls,
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
