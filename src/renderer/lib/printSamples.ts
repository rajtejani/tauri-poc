import type { ReceiptLine, ReceiptScript, ReceiptTemplate } from '../../shared/types';
import { generateId } from '../../shared/utils';

/** Pre-defined font size classes (defaults from print R&D — 22px body is minimum easy-read). */
export type FontSizeClass = 'caption' | 'body' | 'subheading' | 'heading' | 'title';

export type FontSizeMap = Record<FontSizeClass, number>;

export const FONT_SIZE_CLASS_META: {
  class: FontSizeClass;
  level: number;
  label: string;
}[] = [
  { class: 'caption', level: 1, label: 'Caption' },
  { class: 'body', level: 2, label: 'Body' },
  { class: 'subheading', level: 3, label: 'Sub heading' },
  { class: 'heading', level: 4, label: 'Heading' },
  { class: 'title', level: 5, label: 'Title' },
];

export const DEFAULT_FONT_SIZES: FontSizeMap = {
  caption: 20,
  body: 28,
  subheading: 26,
  heading: 28,
  title: 32,
};

export function resolveFontSizes(overrides?: Partial<FontSizeMap>): FontSizeMap {
  return { ...DEFAULT_FONT_SIZES, ...overrides };
}

export function buildFontSizeHierarchy(sizes: FontSizeMap) {
  return FONT_SIZE_CLASS_META.map((m) => ({
    ...m,
    sizePx: sizes[m.class],
  }));
}

export function formatFontSizeClassSummary(sizes: FontSizeMap): string {
  return FONT_SIZE_CLASS_META.map((m) => `${m.label} ${sizes[m.class]}px`).join(' · ');
}

export type FontStyleName = 'normal' | 'bold' | 'italic' | 'underline' | 'strikethrough';

export const FONT_STYLES: { name: FontStyleName; label: string }[] = [
  { name: 'normal', label: 'normal' },
  { name: 'bold', label: 'bold' },
  { name: 'italic', label: 'italic' },
  { name: 'underline', label: 'underline' },
  { name: 'strikethrough', label: 'strikethrough' },
];

/** Languages / scripts included in the print test (English + Indic keyboards). */
export const PRINT_TEST_LANGUAGES: {
  script: ReceiptScript;
  label: string;
  sample: string;
}[] = [
  {
    script: 'latin',
    label: 'English',
    sample: 'Welcome — Total ₹1,250.00 | Table 5',
  },
  {
    script: 'devanagari',
    label: 'Hindi / Marathi (Devanagari)',
    sample: 'नमस्ते — कुल ₹1,250.00 | मसाला दोसा',
  },
  {
    script: 'bengali',
    label: 'Bengali',
    sample: 'স্বাগতম — মোট ₹850.00 | ভাত ও মাছ',
  },
  {
    script: 'gujarati',
    label: 'Gujarati',
    sample: 'સ્વાગત — કુલ ₹999.00 | ઢોકળા',
  },
  {
    script: 'gurmukhi',
    label: 'Punjabi (Gurmukhi)',
    sample: 'ਸਤ ਸ੍ਰੀ ਅਕਾਲ — ਕੁੱਲ ₹500.00',
  },
  {
    script: 'tamil',
    label: 'Tamil',
    sample: 'வணக்கம் — மொத்தம் ₹720.00 | தோசை',
  },
  {
    script: 'telugu',
    label: 'Telugu',
    sample: 'స్వాగతం — మొత్తం ₹640.00 | పూరి',
  },
  {
    script: 'kannada',
    label: 'Kannada',
    sample: 'ಸ್ವಾಗತ — ಒಟ್ಟು ₹580.00 | ಬಿಸಿಬೇಳೆ',
  },
  {
    script: 'malayalam',
    label: 'Malayalam',
    sample: 'സ്വാഗതം — ആകെ ₹910.00 | അപ്പം',
  },
  {
    script: 'oriya',
    label: 'Odia',
    sample: 'ସ୍ୱାଗତ — ମୋଟ ₹430.00',
  },
];

export interface PrintTestGroup {
  id: string;
  label: string;
  scripts: ReceiptScript[];
}

/** Per-card print tests: default English + Gujarati; other languages one card each. */
export const PRINT_TEST_GROUPS: PrintTestGroup[] = [
  { id: 'default', label: 'English + Gujarati', scripts: ['latin', 'gujarati'] },
  { id: 'devanagari', label: 'Hindi / Marathi (Devanagari)', scripts: ['devanagari'] },
  { id: 'bengali', label: 'Bengali', scripts: ['bengali'] },
  { id: 'gurmukhi', label: 'Punjabi (Gurmukhi)', scripts: ['gurmukhi'] },
  { id: 'tamil', label: 'Tamil', scripts: ['tamil'] },
  { id: 'telugu', label: 'Telugu', scripts: ['telugu'] },
  { id: 'kannada', label: 'Kannada', scripts: ['kannada'] },
  { id: 'malayalam', label: 'Malayalam', scripts: ['malayalam'] },
  { id: 'oriya', label: 'Odia', scripts: ['oriya'] },
];

function languageMeta(script: ReceiptScript) {
  return PRINT_TEST_LANGUAGES.find((l) => l.script === script);
}

function line(partial: Partial<ReceiptLine> & Pick<ReceiptLine, 'text' | 'script' | 'sizePx'>): ReceiptLine {
  return {
    id: partial.id ?? generateId(),
    text: partial.text,
    script: partial.script,
    sizePx: partial.sizePx,
    bold: partial.bold ?? false,
    italic: partial.italic ?? false,
    underline: partial.underline ?? false,
    strikethrough: partial.strikethrough ?? false,
    align: partial.align ?? 'left',
    blank: partial.blank,
    gujaratiPlusOne: partial.gujaratiPlusOne,
    gujaratiSizeDelta: partial.gujaratiSizeDelta,
  };
}

function blank(): ReceiptLine {
  return line({ text: '', script: 'latin', sizePx: 10, blank: true });
}

function styleLine(
  script: ReceiptScript,
  sizePx: number,
  style: FontStyleName,
  sample: string,
  gujaratiAdjust?: { enabled: boolean; deltaPx: number }
): ReceiptLine {
  return line({
    text: sample,
    script,
    sizePx,
    bold: style === 'bold',
    italic: style === 'italic',
    underline: style === 'underline',
    strikethrough: style === 'strikethrough',
    gujaratiPlusOne: gujaratiAdjust?.enabled,
    gujaratiSizeDelta: gujaratiAdjust?.enabled ? gujaratiAdjust.deltaPx : undefined,
  });
}

type FontTier = ReturnType<typeof buildFontSizeHierarchy>[number];

function languageBlock(
  script: ReceiptScript,
  _languageLabel: string,
  sample: string,
  hierarchy: FontTier[]
): ReceiptLine[] {
  const rows: ReceiptLine[] = [];

  for (const tier of hierarchy) {
    for (const { name } of FONT_STYLES) {
      rows.push(styleLine(script, tier.sizePx, name, sample));
    }
    rows.push(blank());
  }

  return rows;
}

/** Same size/style back-to-back per language (e.g. English caption then Gujarati caption). */
function interleavedComparisonBlock(scripts: ReceiptScript[], hierarchy: FontTier[]): ReceiptLine[] {
  const metas = scripts
    .map((s) => languageMeta(s))
    .filter((m): m is NonNullable<typeof m> => !!m);

  if (metas.length === 0) return [];

  const rows: ReceiptLine[] = [];

  for (const tier of hierarchy) {
    for (const { name } of FONT_STYLES) {
      for (const meta of metas) {
        rows.push(styleLine(meta.script, tier.sizePx, name, meta.sample));
      }
    }
    rows.push(blank());
  }

  return rows;
}

/** Template for a subset of languages (one print-test card). */
export function buildLanguagesTemplate(
  scripts: ReceiptScript[],
  dotWidth: number,
  groupLabel: string,
  fontSizes: FontSizeMap = DEFAULT_FONT_SIZES
): ReceiptTemplate {
  const hierarchy = buildFontSizeHierarchy(fontSizes);
  const lines: ReceiptLine[] = [
    line({
      text: groupLabel,
      script: 'latin',
      sizePx: 20,
      bold: true,
      align: 'center',
    }),
    blank(),
  ];

  if (scripts.length > 1) {
    lines.push(...interleavedComparisonBlock(scripts, hierarchy));
  } else {
    for (const script of scripts) {
      const meta = languageMeta(script);
      if (!meta) continue;
      lines.push(...languageBlock(meta.script, meta.label, meta.sample, hierarchy));
    }
  }

  lines.push(
    line({
      text: '— End of section —',
      script: 'latin',
      sizePx: 12,
      align: 'center',
    })
  );

  return {
    dotWidth,
    paddingPx: 8,
    lineGapPx: 3,
    lines,
  };
}

export function buildCustomTextTemplate(
  dotWidth: number,
  text: string,
  fontClass: FontSizeClass,
  fontSizes: FontSizeMap,
  style: FontStyleName,
  options: {
    applyGujaratiAdjust: boolean;
    gujaratiSizeDelta: number;
  }
): ReceiptTemplate {
  const trimmed = text.trim() || '(empty)';
  const basePx = fontSizes[fontClass];

  const lines: ReceiptLine[] = [
    line({
      text: 'Custom input test',
      script: 'latin',
      sizePx: 18,
      bold: true,
      align: 'center',
    }),
    blank(),
    styleLine('latin', basePx, style, trimmed, {
      enabled: options.applyGujaratiAdjust,
      deltaPx: options.gujaratiSizeDelta,
    }),
    blank(),
  ];

  return {
    dotWidth,
    paddingPx: 8,
    lineGapPx: 4,
    lines,
  };
}

/** Preview-only template: single line with optional per-run Gujarati +1. */
export function buildCustomTextPreviewTemplate(
  dotWidth: number,
  text: string,
  sizePx: number,
  style: FontStyleName,
  label: string,
  adjust: { enabled: boolean; deltaPx: number }
): ReceiptTemplate {
  const trimmed = text.trim() || '(empty)';
  return {
    dotWidth,
    paddingPx: 8,
    lineGapPx: 4,
    lines: [
      line({ text: label, script: 'latin', sizePx: 12, bold: true, align: 'center' }),
      blank(),
      styleLine('latin', sizePx, style, trimmed, adjust),
    ],
  };
}
