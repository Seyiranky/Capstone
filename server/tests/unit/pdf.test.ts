import { PdfDocument, textWidth, wrap } from '../../src/lib/pdf';

const parse = (buf: Buffer) => buf.toString('latin1');

describe('PDF writer', () => {
  test('produces a well-formed file whose cross-reference offsets point at their objects', () => {
    const doc = new PdfDocument('footer');
    doc.title('Title', 'Subtitle');
    doc.fields([['Name', 'Grace']]);
    const pdf = parse(doc.toBuffer());
    expect(pdf.startsWith('%PDF-1.4')).toBe(true);
    expect(pdf.trimEnd().endsWith('%%EOF')).toBe(true);

    const xrefAt = Number(/startxref\n(\d+)/.exec(pdf)![1]);
    expect(pdf.slice(xrefAt, xrefAt + 4)).toBe('xref');
    const entries = [...pdf.slice(xrefAt).matchAll(/(\d{10}) 00000 n /g)].map((m) => Number(m[1]));
    entries.forEach((offset, i) => expect(pdf.slice(offset).startsWith(`${i + 1} 0 obj`)).toBe(true));
  });

  test('long tables flow onto new pages, numbered "Page n of N"', () => {
    const doc = new PdfDocument('footer');
    doc.table([{ header: 'A', width: 1 }, { header: 'B', width: 1 }], Array.from({ length: 150 }, (_, i) => [`row ${i}`, 'x']));
    const pdf = parse(doc.toBuffer());
    const pages = (pdf.match(/\/Type \/Page \/Parent/g) ?? []).length;
    expect(pages).toBeGreaterThan(2);
    const label = Buffer.from(`Page ${pages} of ${pages}`, 'latin1').toString('hex');
    expect(pdf).toContain(`<${label}>`);
  });

  test('text wraps to the width given, and splits a word too long for a line', () => {
    const lines = wrap('the quick brown fox jumps over the lazy dog', 10, 80);
    expect(lines.length).toBeGreaterThan(1);
    lines.forEach((l) => expect(textWidth(l, 10)).toBeLessThanOrEqual(80));
    const long = wrap('a'.repeat(200), 10, 60);
    long.forEach((l) => expect(textWidth(l, 10)).toBeLessThanOrEqual(60));
  });

  test('text outside the PDF character set cannot break out of a string', () => {
    const doc = new PdfDocument('f');
    doc.paragraph('Close ) ( \\ and an emoji 😀 and Kinyarwanda: Murakoze, ’quotes’');
    const pdf = parse(doc.toBuffer());
    // Every piece of text is written as hex, so no raw brackets or backslashes reach the content stream.
    expect(pdf).not.toMatch(/\(Close/);
    expect(pdf).toContain(Buffer.from('Murakoze', 'latin1').toString('hex'));
  });
});
