/**
 * A small PDF writer for plain reports: headings, wrapped text, label/value
 * rows and tables over as many A4 pages as needed, with page numbers.
 *
 * It uses Helvetica, one of the fonts every PDF reader carries, so nothing is
 * embedded and the files stay small. Text is encoded as WinAnsi (Latin-1 plus
 * typographic quotes and dashes), which covers English and Kinyarwanda.
 * Anything outside it is replaced, never passed through raw.
 */

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 50;
const CONTENT_W = PAGE_W - 2 * MARGIN;
const FOOTER_Y = 30;

type Font = 'regular' | 'bold';
type Rgb = [number, number, number];

const INK: Rgb = [0.094, 0.094, 0.106];
const MUTED: Rgb = [0.443, 0.443, 0.478];
const RULE: Rgb = [0.894, 0.894, 0.906];
const BAND: Rgb = [0.957, 0.957, 0.961];
const BRAND: Rgb = [0.145, 0.169, 0.404];

// Advance widths (1/1000 em) for character codes 32–126, from the Adobe AFM files.
const HELVETICA = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556,
  556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556,
  556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
];
const HELVETICA_BOLD = [
  278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556,
  556, 556, 333, 333, 584, 584, 584, 611, 975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556, 333, 556, 611, 556, 611, 556, 333, 611,
  611, 278, 278, 556, 278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584,
];

// WinAnsi codes for the characters above 126 that are not Latin-1 code points.
const WIN_ANSI_EXTRA: Record<string, number> = {
  '€': 0x80, '‚': 0x82, '„': 0x84, '…': 0x85, '•': 0x95, '–': 0x96, '—': 0x97,
  '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '™': 0x99,
};

/** One byte per character in WinAnsi; unsupported characters become '?'. */
const encode = (text: string): number[] =>
  [...text.normalize('NFC')].map((ch) => {
    const code = ch.codePointAt(0)!;
    if (code === 9 || code === 10 || code === 13) return 32;
    if (code >= 32 && code <= 126) return code;
    if (WIN_ANSI_EXTRA[ch] !== undefined) return WIN_ANSI_EXTRA[ch];
    if (code >= 160 && code <= 255) return code;
    return 63;
  });

const charWidth = (code: number, font: Font) => {
  const table = font === 'bold' ? HELVETICA_BOLD : HELVETICA;
  return code >= 32 && code <= 126 ? table[code - 32] : 556;
};

export const textWidth = (text: string, size: number, font: Font = 'regular') =>
  (encode(text).reduce((sum, c) => sum + charWidth(c, font), 0) * size) / 1000;

/** Breaks text into lines no wider than `width`; long words are split. */
export const wrap = (text: string, size: number, width: number, font: Font = 'regular'): string[] => {
  const lines: string[] = [];
  for (const paragraph of String(text).split(/\r?\n/)) {
    let line = '';
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word;
      if (textWidth(candidate, size, font) <= width) {
        line = candidate;
        continue;
      }
      if (line) lines.push(line);
      // A single word wider than the column is cut to fit.
      let rest = word;
      while (textWidth(rest, size, font) > width) {
        let cut = rest.length - 1;
        while (cut > 1 && textWidth(rest.slice(0, cut), size, font) > width) cut -= 1;
        lines.push(rest.slice(0, cut));
        rest = rest.slice(cut);
      }
      line = rest;
    }
    lines.push(line);
  }
  return lines;
};

const hex = (text: string) => `<${encode(text).map((b) => b.toString(16).padStart(2, '0')).join('')}>`;
const num = (n: number) => (Math.round(n * 100) / 100).toString();
const rgb = (c: Rgb) => c.map(num).join(' ');

export interface Column {
  header: string;
  /** Share of the content width; the shares are normalised. */
  width: number;
  align?: 'left' | 'right';
}

export class PdfDocument {
  private pages: string[][] = [];
  private ops: string[] = [];
  private y = 0;

  constructor(private readonly footer: string) {
    this.newPage();
  }

  private newPage() {
    this.ops = [];
    this.pages.push(this.ops);
    this.y = PAGE_H - MARGIN;
  }

  /** Starts a new page when fewer than `height` points remain. */
  private ensure(height: number) {
    if (this.y - height < MARGIN + 20) this.newPage();
  }

  private drawText(text: string, x: number, y: number, size: number, font: Font, color: Rgb) {
    this.ops.push(`BT /${font === 'bold' ? 'F2' : 'F1'} ${num(size)} Tf ${rgb(color)} rg ${num(x)} ${num(y)} Td ${hex(text)} Tj ET`);
  }

  private fillRect(x: number, y: number, w: number, h: number, color: Rgb) {
    this.ops.push(`${rgb(color)} rg ${num(x)} ${num(y)} ${num(w)} ${num(h)} re f`);
  }

  private line(x1: number, y1: number, x2: number, y2: number, color: Rgb, width = 0.75) {
    this.ops.push(`${rgb(color)} RG ${num(width)} w ${num(x1)} ${num(y1)} m ${num(x2)} ${num(y2)} l S`);
  }

  /** The report's title block, with a line of detail under it. */
  title(text: string, subtitle?: string) {
    this.fillRect(MARGIN, this.y - 25, 4, 26, BRAND);
    this.drawText(text, MARGIN + 14, this.y - 20, 20, 'bold', INK);
    this.y -= 34;
    if (subtitle) {
      for (const l of wrap(subtitle, 10, CONTENT_W - 14)) {
        this.drawText(l, MARGIN + 14, this.y - 10, 10, 'regular', MUTED);
        this.y -= 14;
      }
    }
    this.y -= 16;
  }

  /** A section heading with a rule under it. */
  heading(text: string, note?: string) {
    this.ensure(60);
    this.y -= 8;
    this.drawText(text, MARGIN, this.y - 13, 13, 'bold', INK);
    if (note) {
      const w = textWidth(note, 9);
      this.drawText(note, MARGIN + CONTENT_W - w, this.y - 12, 9, 'regular', MUTED);
    }
    this.y -= 20;
    this.line(MARGIN, this.y, MARGIN + CONTENT_W, this.y, RULE);
    this.y -= 10;
  }

  paragraph(text: string, { size = 10, color = INK }: { size?: number; color?: Rgb } = {}) {
    for (const l of wrap(text, size, CONTENT_W)) {
      this.ensure(size + 4);
      this.drawText(l, MARGIN, this.y - size, size, 'regular', color);
      this.y -= size + 4;
    }
    this.y -= 4;
  }

  muted(text: string) {
    this.paragraph(text, { size: 9.5, color: MUTED });
  }

  /** Label on the left, value on the right, one row per pair. */
  fields(rows: [string, string | number | null | undefined][]) {
    const labelW = 150;
    for (const [label, raw] of rows) {
      const value = raw === null || raw === undefined || raw === '' ? '—' : String(raw);
      const lines = wrap(value, 10, CONTENT_W - labelW);
      this.ensure(lines.length * 14 + 6);
      this.drawText(label, MARGIN, this.y - 10, 9.5, 'regular', MUTED);
      lines.forEach((l, i) => this.drawText(l, MARGIN + labelW, this.y - 10 - i * 14, 10, 'regular', INK));
      this.y -= lines.length * 14 + 6;
    }
    this.y -= 6;
  }

  /** A table that carries its header row onto every page it spans. */
  table(columns: Column[], rows: (string | number | null | undefined)[][]) {
    const total = columns.reduce((s, c) => s + c.width, 0);
    const widths = columns.map((c) => (c.width / total) * CONTENT_W);
    const pad = 5;
    const size = 9;

    const header = () => {
      this.ensure(40);
      this.fillRect(MARGIN, this.y - 18, CONTENT_W, 18, BAND);
      let x = MARGIN;
      columns.forEach((c, i) => {
        const w = textWidth(c.header, 8.5, 'bold');
        const tx = c.align === 'right' ? x + widths[i] - pad - w : x + pad;
        this.drawText(c.header, tx, this.y - 12.5, 8.5, 'bold', MUTED);
        x += widths[i];
      });
      this.y -= 18;
    };

    header();
    for (const row of rows) {
      const cells = row.map((v, i) =>
        wrap(v === null || v === undefined || v === '' ? '—' : String(v), size, widths[i] - 2 * pad),
      );
      const height = Math.max(...cells.map((c) => c.length)) * 12 + 8;
      if (this.y - height < MARGIN + 20) {
        this.newPage();
        header();
      }
      let x = MARGIN;
      cells.forEach((lines, i) => {
        lines.forEach((l, j) => {
          const w = textWidth(l, size);
          const tx = columns[i].align === 'right' ? x + widths[i] - pad - w : x + pad;
          this.drawText(l, tx, this.y - 12 - j * 12, size, 'regular', INK);
        });
        x += widths[i];
      });
      this.y -= height;
      this.line(MARGIN, this.y, MARGIN + CONTENT_W, this.y, RULE, 0.5);
    }
    this.y -= 14;
  }

  /** The finished file. */
  toBuffer(): Buffer {
    const count = this.pages.length;
    this.pages.forEach((ops, i) => {
      const label = `Page ${i + 1} of ${count}`;
      ops.push(`BT /F1 8 Tf ${rgb(MUTED)} rg ${num(MARGIN)} ${FOOTER_Y} Td ${hex(this.footer)} Tj ET`);
      ops.push(`BT /F1 8 Tf ${rgb(MUTED)} rg ${num(PAGE_W - MARGIN - textWidth(label, 8))} ${FOOTER_Y} Td ${hex(label)} Tj ET`);
    });

    // Objects: 1 catalog, 2 page tree, 3–4 fonts, then a page and its content per page.
    const objects: string[] = [];
    const pageIds = this.pages.map((_, i) => 5 + i * 2);
    objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
    objects[2] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${count} >>`;
    objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
    objects[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';
    this.pages.forEach((ops, i) => {
      const pageId = pageIds[i];
      const content = ops.join('\n');
      objects[pageId] =
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${num(PAGE_W)} ${num(PAGE_H)}] ` +
        `/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${pageId + 1} 0 R >>`;
      objects[pageId + 1] = `<< /Length ${Buffer.byteLength(content, 'latin1')} >>\nstream\n${content}\nendstream`;
    });

    let out = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
    const offsets: number[] = [];
    for (let id = 1; id < objects.length; id += 1) {
      offsets[id] = Buffer.byteLength(out, 'latin1');
      out += `${id} 0 obj\n${objects[id]}\nendobj\n`;
    }
    const xref = Buffer.byteLength(out, 'latin1');
    out += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
    for (let id = 1; id < objects.length; id += 1) out += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`;
    out += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    return Buffer.from(out, 'latin1');
  }
}
