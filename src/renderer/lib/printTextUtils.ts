import type { ReceiptScript } from '../../shared/types';
import type { FontSizeClass, FontSizeMap } from './printSamples';

const GUJARATI_RE = /[\u0A80-\u0AFF]/;
const LATIN_RE = /[A-Za-z]/;

export const DEFAULT_GUJARATI_SIZE_DELTA = 1;

export type DetectedScriptHint = 'gujarati' | 'latin' | 'mixed' | 'unknown';

export interface TextRun {
  text: string;
  script: ReceiptScript;
  sizePx: number;
}

export function isGujaratiChar(ch: string): boolean {
  return GUJARATI_RE.test(ch);
}

export function detectScriptHint(text: string): DetectedScriptHint {
  const hasGuj = GUJARATI_RE.test(text);
  const hasLatin = LATIN_RE.test(text);
  if (hasGuj && hasLatin) return 'mixed';
  if (hasGuj) return 'gujarati';
  if (hasLatin) return 'latin';
  return 'unknown';
}

export function hasGujaratiCharacters(text: string): boolean {
  return GUJARATI_RE.test(text);
}

export function scriptForText(text: string): ReceiptScript {
  if (hasGujaratiCharacters(text)) return 'gujarati';
  return 'latin';
}

/** Effective delta for a receipt line (0 = no Gujarati boost). */
export function lineGujaratiDelta(line: {
  gujaratiPlusOne?: boolean;
  gujaratiSizeDelta?: number;
}): number {
  if (!line.gujaratiPlusOne) return 0;
  const d = line.gujaratiSizeDelta ?? DEFAULT_GUJARATI_SIZE_DELTA;
  return Math.max(0, d);
}

/** Split text into Latin vs Gujarati runs; deltaPx applies only to Gujarati runs. */
export function splitGujaratiLatinRuns(
  text: string,
  baseSizePx: number,
  deltaPx: number
): TextRun[] {
  if (!text) return [];

  const delta = Math.max(0, deltaPx);
  const runs: TextRun[] = [];
  let buf = '';
  let currentIsGuj: boolean | null = null;

  const flush = () => {
    if (buf.length === 0 || currentIsGuj === null) return;
    runs.push({
      text: buf,
      script: currentIsGuj ? 'gujarati' : 'latin',
      sizePx: baseSizePx + (currentIsGuj ? delta : 0),
    });
    buf = '';
  };

  for (const ch of text) {
    const g = isGujaratiChar(ch);
    if (currentIsGuj === null) {
      currentIsGuj = g;
    } else if (currentIsGuj !== g) {
      flush();
      currentIsGuj = g;
    }
    buf += ch;
  }
  flush();

  return runs.length ? runs : [{ text, script: 'latin', sizePx: baseSizePx }];
}

export function describeGujaratiAdjustment(
  baseSizePx: number,
  text: string,
  enabled: boolean,
  deltaPx: number
): string {
  const delta = enabled ? Math.max(0, deltaPx) : 0;
  if (delta === 0) {
    return `All runs at ${baseSizePx}px`;
  }
  const hint = detectScriptHint(text);
  const gujSize = baseSizePx + delta;
  if (hint === 'latin') {
    return `English only — all ${baseSizePx}px (no Gujarati boost)`;
  }
  if (hint === 'gujarati') {
    return `Gujarati only — ${baseSizePx}px → ${gujSize}px (+${delta})`;
  }
  if (hint === 'mixed') {
    return `Mixed — English ${baseSizePx}px, Gujarati ${gujSize}px (+${delta}) in same line`;
  }
  return `Base ${baseSizePx}px; Gujarati runs +${delta} when present`;
}

export function sizePxForClass(fontSizes: FontSizeMap, fontClass: FontSizeClass): number {
  return fontSizes[fontClass];
}
