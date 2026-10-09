import type { ReceiptAlign, ReceiptLine, ReceiptScript, ReceiptTemplate } from '../../shared/types';
import { lineGujaratiDelta, splitGujaratiLatinRuns, type TextRun } from './printTextUtils';

const FONT_FAMILY: Record<ReceiptScript, string> = {
  latin:
    '"Noto Sans", "Segoe UI", system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
  devanagari: '"Noto Sans Devanagari", "Nirmala UI", "Mangal", sans-serif',
  bengali: '"Noto Sans Bengali", "Nirmala UI", sans-serif',
  gujarati: '"Noto Sans Gujarati", "Nirmala UI", sans-serif',
  gurmukhi: '"Noto Sans Gurmukhi", "Nirmala UI", sans-serif',
  tamil: '"Noto Sans Tamil", "Nirmala UI", "Latha", sans-serif',
  telugu: '"Noto Sans Telugu", "Nirmala UI", sans-serif',
  kannada: '"Noto Sans Kannada", "Nirmala UI", sans-serif',
  malayalam: '"Noto Sans Malayalam", "Nirmala UI", sans-serif',
  oriya: '"Noto Sans Oriya", "Nirmala UI", sans-serif',
};

function buildFont(line: ReceiptLine, script: ReceiptScript, sizePx: number): string {
  const weight = line.bold ? '700' : '400';
  const style = line.italic ? 'italic' : 'normal';
  const family = FONT_FAMILY[script];
  return `${style} ${weight} ${sizePx}px ${family}`;
}

function measureRunsWidth(ctx: CanvasRenderingContext2D, line: ReceiptLine, runs: TextRun[]): number {
  let w = 0;
  for (const run of runs) {
    ctx.font = buildFont(line, run.script, run.sizePx);
    w += ctx.measureText(run.text).width;
  }
  return w;
}

function maxRunSize(runs: TextRun[], fallback: number): number {
  return runs.reduce((m, r) => Math.max(m, r.sizePx), fallback);
}

function wrapTextSingleFont(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  if (!text.trim()) return [''];
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (ctx.measureText(test).width <= maxWidth) {
      current = test;
    } else {
      if (current) lines.push(current);
      if (ctx.measureText(word).width > maxWidth) {
        let chunk = '';
        for (const ch of word) {
          const t = chunk + ch;
          if (ctx.measureText(t).width > maxWidth && chunk) {
            lines.push(chunk);
            chunk = ch;
          } else {
            chunk = t;
          }
        }
        current = chunk;
      } else {
        current = word;
      }
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [''];
}

/** Word wrap with per-run Gujarati/Latin sizing. */
function wrapTextMixed(
  ctx: CanvasRenderingContext2D,
  line: ReceiptLine,
  text: string,
  maxWidth: number
): string[] {
  if (!text.trim()) return [''];
  const tokens = text.split(/(\s+)/);
  const lines: string[] = [];
  let current = '';

  const delta = lineGujaratiDelta(line);
  const widthOf = (s: string) => {
    const runs = splitGujaratiLatinRuns(s, line.sizePx, delta);
    return measureRunsWidth(ctx, line, runs);
  };

  for (const token of tokens) {
    if (!token) continue;
    const test = current + token;
    if (widthOf(test) <= maxWidth) {
      current = test;
    } else {
      if (current.trim()) lines.push(current);
      if (widthOf(token) > maxWidth) {
        let chunk = '';
        for (const ch of token) {
          const t = chunk + ch;
          if (widthOf(t) > maxWidth && chunk) {
            lines.push(chunk);
            chunk = ch;
          } else {
            chunk = t;
          }
        }
        current = chunk;
      } else {
        current = token;
      }
    }
  }
  if (current.trim()) lines.push(current);
  return lines.length ? lines : [''];
}

interface LayoutRow {
  line: ReceiptLine;
  x: number;
  y: number;
  lineHeight: number;
  totalWidth: number;
  text?: string;
  font?: string;
  metrics?: TextMetrics;
  runs?: TextRun[];
}

function measureLayout(
  template: ReceiptTemplate,
  dotWidth: number
): { rows: LayoutRow[]; totalHeight: number } {
  const pad = template.paddingPx;
  const maxTextWidth = dotWidth - pad * 2;
  const measureCanvas = document.createElement('canvas');
  const ctx = measureCanvas.getContext('2d');
  if (!ctx) {
    return { rows: [], totalHeight: pad * 2 };
  }

  const rows: LayoutRow[] = [];
  let y = pad;

  for (const line of template.lines) {
    if (line.blank) {
      y += line.sizePx + template.lineGapPx;
      continue;
    }

    const delta = lineGujaratiDelta(line);
    const mixed = delta > 0;
    const wrapped = mixed
      ? wrapTextMixed(ctx, line, line.text, maxTextWidth)
      : (() => {
          ctx.font = buildFont(line, line.script, line.sizePx);
          return wrapTextSingleFont(ctx, line.text, maxTextWidth);
        })();

    for (const segment of wrapped) {
      if (mixed) {
        const runs = splitGujaratiLatinRuns(segment, line.sizePx, delta);
        const totalWidth = measureRunsWidth(ctx, line, runs);
        const lineHeight = maxRunSize(runs, line.sizePx) * 1.25;
        let x = pad;
        if (line.align === 'center') {
          x = pad + (maxTextWidth - totalWidth) / 2;
        } else if (line.align === 'right') {
          x = pad + maxTextWidth - totalWidth;
        }
        const baselineY = y + maxRunSize(runs, line.sizePx);
        rows.push({
          line,
          x,
          y: baselineY,
          lineHeight,
          totalWidth,
          runs,
        });
        y += lineHeight + template.lineGapPx;
      } else {
        const font = buildFont(line, line.script, line.sizePx);
        ctx.font = font;
        const metrics = ctx.measureText(segment);
        const width = metrics.width;
        const lineHeight = line.sizePx * 1.25;
        let x = pad;
        if (line.align === 'center') {
          x = pad + (maxTextWidth - width) / 2;
        } else if (line.align === 'right') {
          x = pad + maxTextWidth - width;
        }
        rows.push({
          line,
          text: segment,
          x,
          y: y + line.sizePx,
          lineHeight,
          totalWidth: width,
          font,
          metrics,
        });
        y += lineHeight + template.lineGapPx;
      }
    }
  }

  return { rows, totalHeight: y + pad };
}

function drawRunText(
  ctx: CanvasRenderingContext2D,
  line: ReceiptLine,
  run: TextRun,
  x: number,
  y: number
): number {
  ctx.font = buildFont(line, run.script, run.sizePx);
  const italicSynthetic = line.italic && !ctx.font.includes('italic');
  if (italicSynthetic) {
    ctx.save();
    ctx.translate(x, y);
    ctx.transform(1, 0, -0.25, 1, 0, 0);
    ctx.fillText(run.text, 0, 0);
    ctx.restore();
  } else {
    ctx.fillText(run.text, x, y);
  }
  ctx.font = buildFont(line, run.script, run.sizePx);
  return ctx.measureText(run.text).width;
}

export function renderTemplateToCanvas(
  template: ReceiptTemplate,
  dotWidth?: number
): HTMLCanvasElement {
  const width = dotWidth ?? template.dotWidth;
  const { rows, totalHeight } = measureLayout(template, width);
  const height = Math.max(1, Math.ceil(totalHeight));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#000000';
  ctx.textBaseline = 'alphabetic';

  for (const row of rows) {
    const { line, x, y, totalWidth } = row;
    const drawX = x;
    const drawY = y;

    if (row.runs) {
      let cursorX = drawX;
      for (const run of row.runs) {
        cursorX += drawRunText(ctx, line, run, cursorX, drawY);
      }
    } else if (row.text && row.font) {
      ctx.font = row.font;
      ctx.save();
      if (line.italic && !row.font.includes('italic')) {
        ctx.translate(drawX, drawY);
        ctx.transform(1, 0, -0.25, 1, 0, 0);
        ctx.fillText(row.text, 0, 0);
      } else {
        ctx.fillText(row.text, drawX, drawY);
      }
      ctx.restore();
    }

    const refSize = row.runs ? maxRunSize(row.runs, line.sizePx) : line.sizePx;
    const underlineY = drawY + 2;
    const strikeY = drawY - refSize * 0.35;

    if (line.underline) {
      ctx.beginPath();
      ctx.moveTo(drawX, underlineY);
      ctx.lineTo(drawX + totalWidth, underlineY);
      ctx.lineWidth = Math.max(1, Math.round(refSize / 14));
      ctx.strokeStyle = '#000000';
      ctx.stroke();
    }

    if (line.strikethrough) {
      ctx.beginPath();
      ctx.moveTo(drawX, strikeY);
      ctx.lineTo(drawX + totalWidth, strikeY);
      ctx.lineWidth = Math.max(1, Math.round(refSize / 14));
      ctx.strokeStyle = '#000000';
      ctx.stroke();
    }
  }

  return canvas;
}

export interface MonochromeRaster {
  widthDots: number;
  height: number;
  rows: number[];
}

/** Threshold pixels to 1bpp packed rows (MSB = left, 1 = black). */
export function canvasToMonochrome(
  canvas: HTMLCanvasElement,
  options?: { threshold?: number; dither?: boolean }
): MonochromeRaster {
  const threshold = options?.threshold ?? 128;
  const dither = options?.dither ?? false;
  const w = canvas.width;
  const h = canvas.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return { widthDots: w, height: h, rows: [] };
  }

  const { data } = ctx.getImageData(0, 0, w, h);
  const rowBytes = Math.ceil(w / 8);
  const out = new Uint8Array(rowBytes * h);

  const lumAt = (px: number, py: number): number => {
    const i = (py * w + px) * 4;
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    return 0.299 * r + 0.587 * g + 0.114 * b;
  };

  if (dither) {
    const err = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = y * w + x;
        const old = lumAt(x, y) + err[idx];
        const bit = old < threshold ? 1 : 0;
        const newVal = bit ? 0 : 255;
        const e = old - newVal;
        if (x + 1 < w) err[idx + 1] += (e * 7) / 16;
        if (y + 1 < h) {
          if (x > 0) err[idx + w - 1] += (e * 3) / 16;
          err[idx + w] += (e * 5) / 16;
          if (x + 1 < w) err[idx + w + 1] += e / 16;
        }
        const byteIndex = y * rowBytes + (x >> 3);
        const bitPos = 7 - (x & 7);
        if (bit) out[byteIndex] |= 1 << bitPos;
      }
    }
  } else {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const lum = lumAt(x, y);
        if (lum < threshold) {
          const byteIndex = y * rowBytes + (x >> 3);
          const bitPos = 7 - (x & 7);
          out[byteIndex] |= 1 << bitPos;
        }
      }
    }
  }

  return {
    widthDots: w,
    height: h,
    rows: Array.from(out),
  };
}

export function alignLabel(align: ReceiptAlign): string {
  switch (align) {
    case 'center':
      return 'Center';
    case 'right':
      return 'Right';
    default:
      return 'Left';
  }
}
