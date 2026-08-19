import { describe, it, expect } from 'vitest';
import { extractDate } from '../../src/parser/dateParser.js';

describe('extractDate', () => {
  it('parses YYYY年M月D日', () => {
    const result = extractDate('賞味期限は2026年9月1日です');
    expect(result?.date).toEqual(new Date(2026, 8, 1));
    expect(result?.matchText).toBe('2026年9月1日');
  });

  it('parses YYYY/M/D', () => {
    const result = extractDate('京都の八つ橋 2026/9/1');
    expect(result?.date).toEqual(new Date(2026, 8, 1));
  });

  it('parses YYYY-M-D', () => {
    const result = extractDate('たけのこの里 2026-12-31');
    expect(result?.date).toEqual(new Date(2026, 11, 31));
  });

  it('parses M月D日 and keeps this year when the date is still upcoming', () => {
    const now = new Date(2026, 7, 1); // Aug 1, 2026
    const result = extractDate('もみじ饅頭 9月1日', now);
    expect(result?.date).toEqual(new Date(2026, 8, 1));
  });

  it('parses M月D日 and rolls to next year when the date already passed', () => {
    const now = new Date(2026, 8, 15); // Sep 15, 2026
    const result = extractDate('もみじ饅頭 9月1日', now);
    expect(result?.date).toEqual(new Date(2027, 8, 1));
  });

  it('parses M/D with year inference', () => {
    const now = new Date(2026, 7, 1);
    const result = extractDate('ずんだ餅 3/15', now);
    expect(result?.date).toEqual(new Date(2027, 2, 15));
  });

  it('returns null when no date is present', () => {
    expect(extractDate('おいしいお菓子でした')).toBeNull();
  });

  it('rejects an invalid calendar date', () => {
    expect(extractDate('謎の日付 13月40日')).toBeNull();
  });

  it('reports the match index for use by the caller', () => {
    const result = extractDate('八つ橋 2026/9/1 です');
    expect(result?.index).toBe(4);
  });
});
