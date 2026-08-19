import { startOfDay } from '../util/date.js';

export interface ParsedDate {
  date: Date;
  matchText: string;
  index: number;
}

interface DatePattern {
  regex: RegExp;
  hasYear: boolean;
}

const PATTERNS: DatePattern[] = [
  { regex: /(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日/, hasYear: true },
  { regex: /(\d{4})[/-](\d{1,2})[/-](\d{1,2})/, hasYear: true },
  { regex: /(\d{1,2})月\s*(\d{1,2})日/, hasYear: false },
  { regex: /(\d{1,2})\/(\d{1,2})/, hasYear: false },
];

export function extractDate(text: string, now: Date = new Date()): ParsedDate | null {
  for (const pattern of PATTERNS) {
    const match = pattern.regex.exec(text);
    if (!match) continue;

    const year = pattern.hasYear ? Number(match[1]) : now.getFullYear();
    const month = pattern.hasYear ? Number(match[2]) : Number(match[1]);
    const day = pattern.hasYear ? Number(match[3]) : Number(match[2]);

    const candidate = new Date(year, month - 1, day);
    const isValidCalendarDate =
      candidate.getFullYear() === year &&
      candidate.getMonth() === month - 1 &&
      candidate.getDate() === day;

    if (!isValidCalendarDate) continue;

    if (!pattern.hasYear && startOfDay(candidate) < startOfDay(now)) {
      candidate.setFullYear(year + 1);
    }

    return {
      date: startOfDay(candidate),
      matchText: match[0],
      index: match.index,
    };
  }

  return null;
}
