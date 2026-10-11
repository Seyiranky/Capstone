import { fitSegments, isGsm7, segmentCount, toGsm7 } from '../../src/lib/channels/gsm7';

describe('toGsm7', () => {
  test('straightens curly quotes and apostrophes', () => {
    expect(toGsm7('n’umukozi “Isoko” ‘ok’')).toBe(`n'umukozi "Isoko" 'ok'`);
  });

  test('replaces dashes, ellipses and odd spaces with plain ones', () => {
    expect(toGsm7('A – B — C… D')).toBe('A - B - C... D');
  });

  test('drops emoji and invisible characters', () => {
    expect(toGsm7('Paid 👍🏽 now​ ✅')).toBe('Paid  now ');
  });

  test('removes accents GSM-7 lacks but keeps the ones it has', () => {
    expect(toGsm7('ê â ç é è à')).toBe('e a c é è à');
  });

  test('leaves plain text alone', () => {
    const text = 'Isoko: Payment confirmed (25,000 RWF).';
    expect(toGsm7(text)).toBe(text);
  });

  test('leaves characters with no equivalent for segmentCount to price', () => {
    expect(toGsm7('漢字')).toBe('漢字');
    expect(isGsm7(toGsm7('漢字'))).toBe(false);
  });
});

describe('segmentCount', () => {
  test('160 GSM-7 characters are one segment, 161 are two', () => {
    expect(segmentCount('a'.repeat(160))).toBe(1);
    expect(segmentCount('a'.repeat(161))).toBe(2);
    expect(segmentCount('a'.repeat(306))).toBe(2);
    expect(segmentCount('a'.repeat(307))).toBe(3);
  });

  test('extension characters count twice', () => {
    expect(segmentCount('€'.repeat(80))).toBe(1);
    expect(segmentCount('€'.repeat(81))).toBe(2);
  });

  test('one non-GSM character switches the whole message to 70 a segment', () => {
    expect(segmentCount('a'.repeat(69) + '’')).toBe(1);
    expect(segmentCount('a'.repeat(70) + '’')).toBe(2);
  });

  test('an empty message is no segments', () => {
    expect(segmentCount('')).toBe(0);
  });

  test('a Kinyarwanda notice with a curly apostrophe drops from 3 segments to 1', () => {
    // 150 characters: the elision's curly apostrophe is what makes it UCS-2.
    const text =
      'Isoko: Ubusabe bwawe bw’akazi "Gusana telefoni" bwemewe. Umukiriya azakuvugisha vuba. ' +
      'Fungura porogaramu urebe ibisobanuro byose by akazi.';
    expect(segmentCount(text)).toBe(3);
    expect(segmentCount(toGsm7(text))).toBe(1);
  });
});

describe('fitSegments', () => {
  test('leaves text that already fits alone', () => {
    expect(fitSegments('Isoko: Payment confirmed.')).toBe('Isoko: Payment confirmed.');
  });

  test('cuts long text at a word and marks the cut', () => {
    const long = `Isoko: Application approved. ${'Your application for the gig was approved. '.repeat(6)}`;
    const fitted = fitSegments(long);

    expect(segmentCount(fitted)).toBe(1);
    expect(fitted.endsWith('...')).toBe(true);
    expect(fitted).not.toMatch(/\s\.\.\.$/);
    expect(long.startsWith(fitted.slice(0, -3))).toBe(true);
  });

  test('respects the smaller limit when the text is UCS-2', () => {
    const fitted = fitSegments(`漢 ${'word '.repeat(40)}`);
    expect(segmentCount(fitted)).toBe(1);
    expect(fitted.length).toBeLessThanOrEqual(70);
  });
});
