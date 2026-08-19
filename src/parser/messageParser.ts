import { extractDate } from './dateParser.js';

export interface ParsedRegistration {
  name: string;
  expiryDate: Date;
}

const KEYWORD_PATTERN = /(賞味期限|消費期限|期限)\s*[:：はが]?/g;
const EDGE_PUNCTUATION_PATTERN = /^[:：,、\-・\s]+|[:：,、\-・\s]+$/g;

export function parseRegistrationMessage(
  text: string,
  now: Date = new Date(),
): ParsedRegistration | null {
  const parsed = extractDate(text, now);
  if (!parsed) return null;

  const before = text.slice(0, parsed.index);
  const after = text.slice(parsed.index + parsed.matchText.length);

  let name = (before + after).replace(KEYWORD_PATTERN, ' ');
  name = name.replace(/\s+/g, ' ').trim();
  name = name.replace(EDGE_PUNCTUATION_PATTERN, '').trim();

  if (name.length === 0) return null;

  return { name, expiryDate: parsed.date };
}
