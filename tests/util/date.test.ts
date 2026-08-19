import { describe, it, expect } from 'vitest';
import { startOfDay, addDays, toISODateString, parseISODateString } from '../../src/util/date.js';

describe('startOfDay', () => {
  it('strips the time component', () => {
    const result = startOfDay(new Date(2026, 7, 18, 23, 59, 59));
    expect(result).toEqual(new Date(2026, 7, 18, 0, 0, 0, 0));
  });
});

describe('addDays', () => {
  it('adds days and normalizes to midnight', () => {
    const result = addDays(new Date(2026, 7, 18, 15, 30), 7);
    expect(result).toEqual(new Date(2026, 7, 25, 0, 0, 0, 0));
  });

  it('rolls over month boundaries', () => {
    const result = addDays(new Date(2026, 7, 30), 3);
    expect(result).toEqual(new Date(2026, 8, 2, 0, 0, 0, 0));
  });
});

describe('toISODateString', () => {
  it('formats as YYYY-MM-DD with zero padding', () => {
    expect(toISODateString(new Date(2026, 0, 5))).toBe('2026-01-05');
  });

  it('formats double-digit months and days', () => {
    expect(toISODateString(new Date(2026, 11, 25))).toBe('2026-12-25');
  });
});

describe('parseISODateString', () => {
  it('parses a YYYY-MM-DD string as a local midnight date, independent of the system timezone', () => {
    expect(parseISODateString('2026-09-01')).toEqual(new Date(2026, 8, 1));
  });

  it('round-trips with toISODateString', () => {
    const original = new Date(2026, 0, 5);
    expect(parseISODateString(toISODateString(original))).toEqual(original);
  });
});
