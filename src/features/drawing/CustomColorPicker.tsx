import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import {
  DefaultStylePanel,
  StylePanelArrowheadPicker,
  StylePanelArrowKindPicker,
  StylePanelColorPicker,
  StylePanelDashPicker,
  StylePanelFillPicker,
  StylePanelFontPicker,
  StylePanelGeoShapePicker,
  StylePanelLabelAlignPicker,
  StylePanelOpacityPicker,
  StylePanelSection,
  StylePanelSizePicker,
  StylePanelSplinePicker,
  StylePanelTextAlignPicker,
  useEditor,
  useValue,
  type TLUiStylePanelProps,
} from "tldraw";
import { clearActiveCustomColor, getActiveCustomColor, normalizeHexColor, readRecentCustomColors, saveRecentCustomColor, setActiveCustomColor } from "./customColor";

function CustomColorPicker() {
  const editor = useEditor();
  const active = useValue("mindcanvas custom color", () => getActiveCustomColor(editor), [editor]);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(active ?? "#7C3AED");
  const [recent, setRecent] = useState<string[]>(() => readRecentCustomColors());
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [popoverStyle, setPopoverStyle] = useState<CSSProperties | null>(null);
  const normalized = normalizeHexColor(draft);

  useEffect(() => {
    if (open) setDraft(active ?? "#7C3AED");
  }, [active, open]);

  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const width = Math.min(220, window.innerWidth - 24);
      const left = Math.max(12, Math.min(rect.left + rect.width / 2 - width / 2, window.innerWidth - width - 12));
      setPopoverStyle({ position: "fixed", top: rect.bottom + 8, left, width, zIndex: 10000 });
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [open]);

  const apply = (value = draft) => {
    const color = normalizeHexColor(value);
    if (!color || !setActiveCustomColor(editor, color)) return;
    setRecent(saveRecentCustomColor(color));
    setDraft(color);
    setOpen(false);
  };

  const picker = open && popoverStyle && typeof document !== "undefined" ? createPortal(
    <div className="mc-custom-color__popover" style={popoverStyle} role="dialog" aria-label="Custom color picker" onPointerDown={(event) => editor.markEventAsHandled(event.nativeEvent)}>
      <div className="mc-custom-color__heading">Custom color</div>
      <div className="mc-custom-color__row">
        <label className="mc-custom-color__picker">
          <span className="sr-only">Choose color</span>
          <input aria-label="Choose custom color" type="color" value={normalized ?? "#7C3AED"} onChange={(event) => setDraft(event.target.value.toUpperCase())} />
        </label>
        <label className="mc-custom-color__hex">
          <span>HEX</span>
          <input aria-label="HEX color" value={draft} maxLength={7} onChange={(event) => setDraft(event.target.value)} spellCheck={false} />
        </label>
      </div>
      {recent.length > 0 && <div className="mc-custom-color__recent" aria-label="Recent colors">
        {recent.map((color) => <button key={color} type="button" aria-label={`Use ${color}`} title={color} style={{ background: color }} onClick={() => apply(color)} />)}
      </div>}
      <div className="mc-custom-color__actions">
        <button type="button" onClick={() => setOpen(false)}>Cancel</button>
        <button type="button" disabled={!normalized} onClick={() => apply()}>Apply</button>
      </div>
    </div>,
    document.body,
  ) : null;

  return <div className="mc-custom-color" onPointerDown={(event) => editor.markEventAsHandled(event.nativeEvent)}>
    <button
      ref={triggerRef}
      type="button"
      className="mc-custom-color__trigger"
      aria-label="Custom color"
      aria-expanded={open}
      title="Choose a custom color"
      onClick={() => setOpen((value) => !value)}
    >🌈</button>
    {picker}
  </div>;
}

function MindCanvasStylePanelContent() {
  return <>
    <StylePanelSection>
      <StylePanelColorPicker />
      <CustomColorPicker />
      <StylePanelOpacityPicker />
    </StylePanelSection>
    <StylePanelSection>
      <StylePanelFillPicker />
      <StylePanelDashPicker />
      <StylePanelSizePicker />
    </StylePanelSection>
    <StylePanelSection>
      <StylePanelFontPicker />
      <StylePanelTextAlignPicker />
      <StylePanelLabelAlignPicker />
    </StylePanelSection>
    <StylePanelSection>
      <StylePanelGeoShapePicker />
      <StylePanelArrowKindPicker />
      <StylePanelArrowheadPicker />
      <StylePanelSplinePicker />
    </StylePanelSection>
  </>;
}

/** Keeps all built-in palette items, appending exactly one rainbow control. */
export function MindCanvasStylePanel(props: TLUiStylePanelProps) {
  const editor = useEditor();
  return <div onPointerDownCapture={(event) => {
    const target = event.target as HTMLElement;
    // The built-in colour buttons always carry this accessible label. Capture
    // it before tldraw changes the enum style so selecting black also exits
    // custom-colour mode.
    if (target.closest('[aria-label^="색깔 —"], [aria-label^="Color —"]')) clearActiveCustomColor(editor);
  }}>
    <DefaultStylePanel {...props}>
      <MindCanvasStylePanelContent />
    </DefaultStylePanel>
  </div>;
}
