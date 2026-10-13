import { percentile, summarise } from '../../src/services/rateService';

describe('rate guidance maths', () => {
  test('percentiles interpolate between values', () => {
    const sorted = [10000, 20000, 30000, 40000];
    expect(percentile(sorted, 0.5)).toBe(25000);
    expect(percentile(sorted, 0.25)).toBe(17500);
    expect(percentile(sorted, 0)).toBe(10000);
    expect(percentile(sorted, 1)).toBe(40000);
  });

  test('a summary sorts its input and rounds to the nearest 500 RWF', () => {
    const guide = summarise([31000, 9000, 20000], 'paid', 'digital_web');
    expect(guide).toEqual({
      category: 'digital_web',
      basis: 'paid',
      sampleSize: 3,
      p25: 14500,
      median: 20000,
      p75: 25500,
    });
  });
});
