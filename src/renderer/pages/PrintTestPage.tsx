import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  FlaskConical,
  Loader2,
  Play,
  AlertCircle,
  Check,
  Wrench,
  RotateCcw,
} from 'lucide-react';
import type { PrinterConfig, RasterMode, SelftestPrintArgs } from '../../shared/types';
import { PAPER_WIDTH_DOTS } from '../../shared/types';
import { browserMockAPI } from '../lib/browserMock';
import { canvasToMonochrome, renderTemplateToCanvas } from '../lib/receiptCanvas';
import {
  PRINT_TEST_GROUPS,
  buildCustomTextPreviewTemplate,
  buildCustomTextTemplate,
  buildLanguagesTemplate,
  DEFAULT_FONT_SIZES,
  FONT_SIZE_CLASS_META,
  FONT_STYLES,
  type FontSizeClass,
  type FontSizeMap,
  type FontStyleName,
  type PrintTestGroup,
} from '../lib/printSamples';
import {
  DEFAULT_GUJARATI_SIZE_DELTA,
  describeGujaratiAdjustment,
  detectScriptHint,
  sizePxForClass,
} from '../lib/printTextUtils';

const getApi = () =>
  window.electronAPI ?? (browserMockAPI as unknown as NonNullable<typeof window.electronAPI>);

const DEFAULT_DOT_WIDTH = PAPER_WIDTH_DOTS['80mm'];

/** Display scale: 1 CSS px per printer dot (scroll if card is narrow). */
const PREVIEW_DISPLAY_SCALE = 1;

function printerConnectionArgs(printer: PrinterConfig): SelftestPrintArgs {
  const isUsb = printer.connectionType === 'usb';
  return {
    connectionType: isUsb ? 'usb' : 'network',
    ip: isUsb ? undefined : printer.ip,
    port: isUsb ? undefined : printer.port,
    name: printer.name,
  };
}

function ReceiptCanvasPreview({
  canvas,
  label,
}: {
  canvas: HTMLCanvasElement;
  label?: string;
}) {
  const displayRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const el = displayRef.current;
    if (!el) return;
    el.width = canvas.width;
    el.height = canvas.height;
    const ctx = el.getContext('2d');
    if (ctx) {
      ctx.drawImage(canvas, 0, 0);
    }
  }, [canvas]);

  const cssW = canvas.width * PREVIEW_DISPLAY_SCALE;
  const cssH = canvas.height * PREVIEW_DISPLAY_SCALE;

  return (
    <div className="space-y-1 min-w-0">
      {label && <p className="text-xs font-medium text-slate-600">{label}</p>}
      <p className="text-[10px] text-slate-400">
        {canvas.width}×{canvas.height} dots @ {PREVIEW_DISPLAY_SCALE}×
      </p>
      <div className="overflow-auto max-h-[24rem] rounded-lg bg-slate-100 p-2 border border-slate-200">
        <canvas
          ref={displayRef}
          className="block border border-slate-300 bg-white shadow-sm"
          style={{
            width: cssW,
            height: cssH,
            imageRendering: 'pixelated',
          }}
        />
      </div>
    </div>
  );
}

function GroupCard({
  group,
  dotWidth,
  fontSizes,
  printer,
  rasterMode,
  printingId,
  onPrint,
}: {
  group: PrintTestGroup;
  dotWidth: number;
  fontSizes: FontSizeMap;
  printer: PrinterConfig | null;
  rasterMode: RasterMode;
  printingId: string | null;
  onPrint: (groupId: string) => void;
}) {
  const template = useMemo(
    () => buildLanguagesTemplate(group.scripts, dotWidth, group.label, fontSizes),
    [group, dotWidth, fontSizes]
  );
  const canvas = useMemo(
    () => renderTemplateToCanvas(template, dotWidth),
    [template, dotWidth]
  );

  return (
    <div className="rounded-xl border border-slate-200 bg-surface-card p-4 shadow-sm space-y-3 flex flex-col min-w-0 h-full">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-800 leading-snug">{group.label}</h2>
        <button
          type="button"
          onClick={() => onPrint(group.id)}
          disabled={!printer || printingId !== null}
          className="flex items-center gap-1.5 rounded-lg bg-primary hover:bg-primary-hover disabled:opacity-50 text-white px-3 py-1.5 text-xs font-medium shrink-0"
        >
          {printingId === group.id ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Printing…
            </>
          ) : (
            <>
              <Play className="h-3.5 w-3.5 fill-current" />
              Test print
            </>
          )}
        </button>
      </div>
      <ReceiptCanvasPreview canvas={canvas} />
      <p className="text-[10px] text-slate-400 mt-auto">
        {rasterMode === 'escstar' ? 'ESC * bit image' : 'GS v 0 raster'}
      </p>
    </div>
  );
}

export function PrintTestPage() {
  const [printer, setPrinter] = useState<PrinterConfig | null>(null);
  const [loadingPrinters, setLoadingPrinters] = useState(true);
  const [rasterMode, setRasterMode] = useState<RasterMode>('escstar');
  const [fontSizes, setFontSizes] = useState<FontSizeMap>(() => ({ ...DEFAULT_FONT_SIZES }));
  const [printingId, setPrintingId] = useState<string | null>(null);
  const [customPrinting, setCustomPrinting] = useState(false);
  const [selfTesting, setSelfTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [customText, setCustomText] = useState('Welcome | સ્વાગત');
  const [customFontClass, setCustomFontClass] = useState<FontSizeClass>('body');
  const [customStyle, setCustomStyle] = useState<FontStyleName>('normal');
  const [applyGujaratiAdjust, setApplyGujaratiAdjust] = useState(true);
  const [gujaratiSizeDelta, setGujaratiSizeDelta] = useState(DEFAULT_GUJARATI_SIZE_DELTA);

  const dotWidth = printer ? (PAPER_WIDTH_DOTS[printer.width] ?? DEFAULT_DOT_WIDTH) : DEFAULT_DOT_WIDTH;

  const baseSizePx = sizePxForClass(fontSizes, customFontClass);
  const scriptHint = detectScriptHint(customText);
  const effectiveDelta = applyGujaratiAdjust ? Math.max(0, gujaratiSizeDelta) : 0;
  const sizeDescription = describeGujaratiAdjustment(
    baseSizePx,
    customText,
    applyGujaratiAdjust,
    gujaratiSizeDelta
  );

  const customPrintTemplate = useMemo(
    () =>
      buildCustomTextTemplate(dotWidth, customText, customFontClass, fontSizes, customStyle, {
        applyGujaratiAdjust,
        gujaratiSizeDelta: effectiveDelta,
      }),
    [
      dotWidth,
      customText,
      customFontClass,
      fontSizes,
      customStyle,
      applyGujaratiAdjust,
      effectiveDelta,
    ]
  );

  const customPrintCanvas = useMemo(
    () => renderTemplateToCanvas(customPrintTemplate, dotWidth),
    [customPrintTemplate, dotWidth]
  );

  const previewBaseTemplate = useMemo(
    () =>
      buildCustomTextPreviewTemplate(
        dotWidth,
        customText,
        baseSizePx,
        customStyle,
        `All runs ${baseSizePx}px (adjust off)`,
        { enabled: false, deltaPx: 0 }
      ),
    [dotWidth, customText, baseSizePx, customStyle]
  );

  const previewAdjustedTemplate = useMemo(
    () =>
      buildCustomTextPreviewTemplate(
        dotWidth,
        customText,
        baseSizePx,
        customStyle,
        applyGujaratiAdjust
          ? `Gujarati +${effectiveDelta}px → ${baseSizePx + effectiveDelta}px`
          : `Same as base (adjust off)`,
        { enabled: applyGujaratiAdjust, deltaPx: effectiveDelta }
      ),
    [dotWidth, customText, baseSizePx, customStyle, applyGujaratiAdjust, effectiveDelta]
  );

  const canvasBase = useMemo(
    () => renderTemplateToCanvas(previewBaseTemplate, dotWidth),
    [previewBaseTemplate, dotWidth]
  );
  const canvasAdjusted = useMemo(
    () => renderTemplateToCanvas(previewAdjustedTemplate, dotWidth),
    [previewAdjustedTemplate, dotWidth]
  );

  useEffect(() => {
    void (async () => {
      try {
        setLoadingPrinters(true);
        const api = getApi();
        if (api) {
          const list = await api.getPrintersConfig();
          setPrinter(list?.[0] ?? null);
        }
      } catch (e) {
        console.error(e);
        setError('Could not load printer config. Add a printer on the Printers page.');
      } finally {
        setLoadingPrinters(false);
      }
    })();
  }, []);

  const setFontSize = (fontClass: FontSizeClass, raw: string) => {
    const parsed = parseInt(raw, 10);
    if (Number.isNaN(parsed)) return;
    const clamped = Math.min(64, Math.max(8, parsed));
    setFontSizes((prev) => ({ ...prev, [fontClass]: clamped }));
  };

  const resetFontSizes = () => setFontSizes({ ...DEFAULT_FONT_SIZES });

  const flashSuccess = (msg: string) => {
    setSuccess(msg);
    setTimeout(() => setSuccess(null), 4000);
  };

  const handleSelfTest = async () => {
    if (!printer) {
      setError('No printer configured.');
      return;
    }
    setSelfTesting(true);
    setError(null);
    try {
      const api = getApi();
      if (!api?.printSelftest) throw new Error('Desktop API unavailable');
      await api.printSelftest(printerConnectionArgs(printer));
      flashSuccess('Self-test sent — check which square prints correctly');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSelfTesting(false);
    }
  };

  const handleGroupPrint = async (groupId: string) => {
    if (!printer) {
      setError('No printer configured.');
      return;
    }
    const group = PRINT_TEST_GROUPS.find((g) => g.id === groupId);
    if (!group) return;

    setPrintingId(groupId);
    setError(null);
    try {
      const api = getApi();
      if (!api?.printRaster) throw new Error('Desktop API unavailable');

      const template = buildLanguagesTemplate(group.scripts, dotWidth, group.label, fontSizes);
      const canvas = renderTemplateToCanvas(template, dotWidth);
      const mono = canvasToMonochrome(canvas, { dither: false });

      await api.printRaster({
        widthDots: mono.widthDots,
        height: mono.height,
        rows: mono.rows,
        mode: rasterMode,
        ...printerConnectionArgs(printer),
      });

      flashSuccess(`"${group.label}" sent to ${printer.name}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPrintingId(null);
    }
  };

  const handleCustomPrint = async () => {
    if (!printer) {
      setError('No printer configured.');
      return;
    }
    setCustomPrinting(true);
    setError(null);
    try {
      const api = getApi();
      if (!api?.printRaster) throw new Error('Desktop API unavailable');
      const mono = canvasToMonochrome(customPrintCanvas, { dither: false });
      await api.printRaster({
        widthDots: mono.widthDots,
        height: mono.height,
        rows: mono.rows,
        mode: rasterMode,
        ...printerConnectionArgs(printer),
      });
      flashSuccess('Custom text test sent to printer');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCustomPrinting(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-[90rem] px-6 py-8 space-y-6">
        <div className="space-y-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
              <FlaskConical className="h-6 w-6 text-primary" />
              Print Test
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Font classes are configured above; receipt lines show sample text only (no metadata
              prefixes). Use custom input to compare Google Translate vs typing-tool Gujarati.
            </p>
            {!loadingPrinters && printer && (
              <p className="mt-2 text-xs text-slate-500">
                Target: <span className="font-medium text-slate-700">{printer.name}</span> (
                {printer.width}, {dotWidth} dots)
              </p>
            )}
          </div>

          <div className="rounded-lg border border-slate-200 bg-surface-card p-4 space-y-3 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-slate-800">Font size classes</h2>
              <button
                type="button"
                onClick={resetFontSizes}
                className="flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-primary"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Reset defaults
              </button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {FONT_SIZE_CLASS_META.map(({ class: fontClass, label }) => (
                <div key={fontClass} className="space-y-1">
                  <label
                    htmlFor={`font-${fontClass}`}
                    className="text-[10px] font-bold text-slate-400 uppercase block"
                  >
                    {label}
                  </label>
                  <div className="flex items-center gap-1">
                    <input
                      id={`font-${fontClass}`}
                      type="number"
                      min={8}
                      max={64}
                      value={fontSizes[fontClass]}
                      onChange={(e) => setFontSize(fontClass, e.target.value)}
                      className="w-full text-sm font-mono rounded border border-slate-200 px-2 py-1.5"
                    />
                    <span className="text-xs text-slate-400 shrink-0">px</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-primary/25 bg-surface-card p-4 shadow-sm space-y-4">
            <h2 className="text-sm font-semibold text-slate-800">Custom text test</h2>
            <textarea
              value={customText}
              onChange={(e) => setCustomText(e.target.value)}
              rows={3}
              className="w-full text-sm rounded border border-slate-200 px-3 py-2 font-sans"
              placeholder="Paste text from Google Translate, Gujarati keyboard, etc."
            />
            <div className="flex flex-wrap gap-4 items-end">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase">Font class</label>
                <select
                  value={customFontClass}
                  onChange={(e) => setCustomFontClass(e.target.value as FontSizeClass)}
                  className="text-sm rounded border border-slate-200 px-3 py-2 bg-white min-w-[140px]"
                >
                  {FONT_SIZE_CLASS_META.map(({ class: c, label }) => (
                    <option key={c} value={c}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase">Style</label>
                <select
                  value={customStyle}
                  onChange={(e) => setCustomStyle(e.target.value as FontStyleName)}
                  className="text-sm rounded border border-slate-200 px-3 py-2 bg-white min-w-[120px]"
                >
                  {FONT_STYLES.map(({ name, label }) => (
                    <option key={name} value={name}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-700 pb-2">
                <input
                  type="checkbox"
                  checked={applyGujaratiAdjust}
                  onChange={(e) => setApplyGujaratiAdjust(e.target.checked)}
                  className="rounded border-slate-300"
                />
                Gujarati size boost (Latin stays base)
              </label>
              <div className="space-y-1 pb-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase">
                  Gujarati +px
                </label>
                <input
                  type="number"
                  min={0}
                  max={16}
                  disabled={!applyGujaratiAdjust}
                  value={gujaratiSizeDelta}
                  onChange={(e) => {
                    const n = parseInt(e.target.value, 10);
                    if (!Number.isNaN(n)) setGujaratiSizeDelta(Math.min(16, Math.max(0, n)));
                  }}
                  className="w-20 text-sm font-mono rounded border border-slate-200 px-2 py-1.5 disabled:opacity-50"
                />
              </div>
              <button
                type="button"
                onClick={handleCustomPrint}
                disabled={customPrinting || !printer}
                className="flex items-center gap-2 rounded-lg bg-primary hover:bg-primary-hover disabled:opacity-50 text-white px-4 py-2 text-sm font-medium ml-auto"
              >
                {customPrinting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Play className="h-4 w-4 fill-current" />
                )}
                Test print custom
              </button>
            </div>
            <p className="text-xs text-slate-500">
              Detected: <span className="font-medium">{scriptHint}</span>
              {' · '}
              {sizeDescription}
            </p>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <ReceiptCanvasPreview canvas={canvasBase} />
              <ReceiptCanvasPreview canvas={canvasAdjusted} />
            </div>
            <p className="text-[10px] text-slate-400">
              Left = no boost. Right = Gujarati letters get +N px only (English unchanged). Test
              print uses the right panel when adjust is on.
            </p>
          </div>

          <div className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-surface-muted/50 p-4">
            <div className="space-y-1 min-w-[220px]">
              <label className="text-[10px] font-bold text-slate-400 uppercase">
                Compatibility mode
              </label>
              <select
                value={rasterMode}
                onChange={(e) => setRasterMode(e.target.value as RasterMode)}
                className="w-full text-sm rounded border border-slate-200 px-3 py-2 bg-white"
              >
                <option value="escstar">ESC * bit image (default)</option>
                <option value="gsv0">GS v 0 raster</option>
              </select>
            </div>
            <button
              type="button"
              onClick={handleSelfTest}
              disabled={selfTesting || loadingPrinters || !printer}
              className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white hover:bg-surface-muted disabled:opacity-50 px-4 py-2 text-sm font-medium text-slate-800"
            >
              {selfTesting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Wrench className="h-4 w-4" />
              )}
              Printer self-test
            </button>
            {(success || error) && (
              <div className="flex flex-col gap-1 ml-auto">
                {success && (
                  <span className="flex items-center gap-1 text-xs font-semibold text-primary">
                    <Check className="h-3.5 w-3.5" />
                    {success}
                  </span>
                )}
                {error && (
                  <span className="flex items-center gap-1 text-xs font-semibold text-rose-600 max-w-xs">
                    <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                    {error}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-stretch">
          {PRINT_TEST_GROUPS.map((group) => (
            <GroupCard
              key={group.id}
              group={group}
              dotWidth={dotWidth}
              fontSizes={fontSizes}
              printer={printer}
              rasterMode={rasterMode}
              printingId={printingId}
              onPrint={handleGroupPrint}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
