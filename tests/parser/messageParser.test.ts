import { describe, it, expect } from 'vitest';
import { parseRegistrationMessage } from '../../src/parser/messageParser.js';

describe('parseRegistrationMessage', () => {
  it('extracts name and date when the date follows the name', () => {
    const result = parseRegistrationMessage('京都の八つ橋 賞味期限 2026年9月1日');
    expect(result).toEqual({
      name: '京都の八つ橋',
      expiryDate: new Date(2026, 8, 1),
    });
  });

  it('extracts name and date without a keyword', () => {
    const result = parseRegistrationMessage('たけのこの里 2026/12/31');
    expect(result).toEqual({
      name: 'たけのこの里',
      expiryDate: new Date(2026, 11, 31),
    });
  });

  it('strips a colon after the keyword', () => {
    const result = parseRegistrationMessage('ずんだ餅 期限:2026-10-10');
    expect(result?.name).toBe('ずんだ餅');
  });

  it('returns null when there is no date', () => {
    expect(parseRegistrationMessage('おいしかったです')).toBeNull();
  });

  it('returns null when the message is only a date', () => {
    expect(parseRegistrationMessage('2026年9月1日')).toBeNull();
  });

  it('returns null when the message is only a date with a keyword', () => {
    expect(parseRegistrationMessage('賞味期限: 2026年9月1日')).toBeNull();
  });
});
