# ExpiryBot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Discord bot that lets users register souvenir expiry dates via free-text chat in a dedicated channel, stores them in Notion, and reminds the channel daily about items expiring soon, letting users mark them consumed with a ✅ reaction.

**Architecture:** A TypeScript/Node.js process using discord.js for Discord I/O, the Notion SDK for persistence, a local SQLite file to map Discord notification messages to Notion pages (so reactions can resolve back to the right item), and node-cron for the daily reminder job. Each concern (date parsing, message parsing, Notion access, mapping storage, Discord event handlers) lives in its own small, independently testable module, wired together in `src/index.ts`.

**Tech Stack:** TypeScript, Node.js 22+, discord.js v14, @notionhq/client, better-sqlite3, node-cron, dotenv, vitest (tests), Docker for deployment.

**Spec:** `docs/superpowers/specs/2026-08-18-expirybot-design.md`

## Global Constraints

- Node.js >= 22 (raised from the original >=18 during Task 1's review — better-sqlite3's only version that builds on modern Node requires >=22; see SDD ledger), TypeScript with `strict: true`.
- Only the dedicated `REGISTER_CHANNEL_ID` channel is monitored for registrations; all other channels are ignored.
- Notion database properties are exactly: `商品名` (title), `賞味期限` (date), `ステータス` (select: `未消費`/`消費済み`), `登録者` (rich_text), `元メッセージ` (url). Created time is Notion's automatic property, not written by the app.
- Date parser supports, in priority order: `YYYY年M月D日`, `YYYY/M/D` or `YYYY-M-D`, `M月D日`, `M/D`. Year-less dates before today roll to next year.
- Daily notification posts one Discord message per item, threshold = today + `REMINDER_DAYS` (default 7) days, includes already-overdue items labeled `⚠️期限切れ`.
- Completion is driven only by a user (non-bot) ✅ reaction on a notification message; the bot's own initial ✅ reaction must not trigger completion.
- No OCR, no multi-guild support, no LLM-based parsing — out of scope per spec.

---

## File Structure

```
ExpiryBot/
  package.json
  tsconfig.json
  vitest.config.ts
  .gitignore
  .env.example
  Dockerfile
  README.md
  src/
    config.ts                    # env var loading/validation
    util/
      date.ts                    # startOfDay, addDays, toISODateString
    parser/
      dateParser.ts               # extractDate()
      messageParser.ts            # parseRegistrationMessage()
    db/
      mappingStore.ts             # SQLite discord_message_id -> notion_page_id
    notion/
      client.ts                   # NotionClientLike, createNotionClient()
      souvenirs.ts                 # createSouvenir/getSoonExpiring/markConsumed
    discord/
      registerHandler.ts          # messageCreate handler for register channel
      notifyJob.ts                 # daily cron job body
      reactionHandler.ts          # messageReactionAdd handler
    index.ts                     # wiring/entrypoint
  tests/
    config.test.ts
    util/date.test.ts
    parser/dateParser.test.ts
    parser/messageParser.test.ts
    db/mappingStore.test.ts
    notion/client.test.ts
    notion/souvenirs.test.ts
    discord/registerHandler.test.ts
    discord/notifyJob.test.ts
    discord/reactionHandler.test.ts
```

Each Discord/Notion-facing module defines a small structural ("Xxx-Like") interface for exactly what it needs, instead of depending on full discord.js/`@notionhq/client` types. This keeps unit tests free of network calls and real Discord/Notion objects — tests build plain object literals that satisfy the interfaces, and in `src/index.ts` the real discord.js/Notion objects are passed in because they structurally satisfy those same interfaces.

---

### Task 1: Project scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `.gitignore`
- Create: `.env.example`
- Test: `tests/smoke.test.ts`

**Interfaces:**
- Produces: an `npm test` command that runs vitest, and an `npm run build` command that compiles `src/` to `dist/` — every later task relies on both working.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "expirybot",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "engines": {
    "node": ">=22"
  },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "start": "node dist/index.js",
    "dev": "tsx watch src/index.ts",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@notionhq/client": "^2.2.15",
    "better-sqlite3": "^13.0.0",
    "discord.js": "^14.16.3",
    "dotenv": "^16.4.5",
    "node-cron": "^3.0.3"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.11",
    "@types/node": "^20.14.15",
    "@types/node-cron": "^3.0.11",
    "tsx": "^4.19.1",
    "typescript": "^5.6.2",
    "vitest": "^2.1.1"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": false,
    "sourceMap": true
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
  },
});
```

- [ ] **Step 4: Create `.gitignore`**

```
node_modules/
dist/
.env
data/
*.sqlite
*.sqlite3
```

- [ ] **Step 5: Create `.env.example`**

```
DISCORD_TOKEN=
NOTION_TOKEN=
NOTION_DATABASE_ID=
REGISTER_CHANNEL_ID=
NOTIFY_CHANNEL_ID=
REMINDER_DAYS=7
NOTIFY_CRON=0 9 * * *
TZ=Asia/Tokyo
MAPPING_DB_PATH=./data/mapping.sqlite
```

- [ ] **Step 6: Install dependencies**

Run: `npm install`
Expected: installs succeed, `package-lock.json` is created.

- [ ] **Step 7: Write a smoke test**

```ts
// tests/smoke.test.ts
import { describe, it, expect } from 'vitest';

describe('smoke', () => {
  it('runs the test toolchain', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 8: Run the test suite and verify it passes**

Run: `npm test`
Expected: 1 passed test (`smoke.test.ts`).

- [ ] **Step 9: Verify the build compiles**

Run: `npm run build`
Expected: succeeds (there is no `src/` yet, so this may need an empty `src/index.ts` placeholder — create `src/index.ts` with just `export {};` if `tsc` errors on a missing rootDir input, then re-run).

- [ ] **Step 10: Commit**

```bash
git add package.json package-lock.json tsconfig.json vitest.config.ts .gitignore .env.example tests/smoke.test.ts src/index.ts
git commit -m "chore: scaffold ExpiryBot project"
```

---

### Task 2: Date utilities

**Files:**
- Create: `src/util/date.ts`
- Test: `tests/util/date.test.ts`

**Interfaces:**
- Produces: `startOfDay(date: Date): Date`, `addDays(date: Date, days: number): Date`, `toISODateString(date: Date): string`, `parseISODateString(value: string): Date` — used by `dateParser.ts`, `notion/souvenirs.ts`, and `discord/notifyJob.ts`.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/util/date.test.ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL with "Cannot find module '../../src/util/date.js'" (or similar).

- [ ] **Step 3: Implement `src/util/date.ts`**

```ts
export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function addDays(date: Date, days: number): Date {
  const result = startOfDay(date);
  result.setDate(result.getDate() + days);
  return result;
}

export function toISODateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function parseISODateString(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/util/date.ts tests/util/date.test.ts
git commit -m "feat: add date utility helpers"
```

---

### Task 3: Config loader

**Files:**
- Create: `src/config.ts`
- Test: `tests/config.test.ts`

**Interfaces:**
- Produces:
```ts
export interface Config {
  discordToken: string;
  notionToken: string;
  notionDatabaseId: string;
  registerChannelId: string;
  notifyChannelId: string;
  reminderDays: number;
  notifyCron: string;
  timezone: string;
  mappingDbPath: string;
}

export function loadConfig(env?: NodeJS.ProcessEnv): Config;
```
  Used by `src/index.ts` to configure every other module.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/config.test.ts
import { describe, it, expect } from 'vitest';
import { loadConfig } from '../src/config.js';

const baseEnv = {
  DISCORD_TOKEN: 'discord-token',
  NOTION_TOKEN: 'notion-token',
  NOTION_DATABASE_ID: 'db-id',
  REGISTER_CHANNEL_ID: 'register-channel',
  NOTIFY_CHANNEL_ID: 'notify-channel',
};

describe('loadConfig', () => {
  it('throws when a required variable is missing', () => {
    const { DISCORD_TOKEN, ...rest } = baseEnv;
    expect(() => loadConfig(rest)).toThrow(/DISCORD_TOKEN/);
  });

  it('applies defaults for optional variables', () => {
    const config = loadConfig(baseEnv);
    expect(config.reminderDays).toBe(7);
    expect(config.notifyCron).toBe('0 9 * * *');
    expect(config.timezone).toBe('Asia/Tokyo');
    expect(config.mappingDbPath).toBe('./data/mapping.sqlite');
  });

  it('honors overrides for optional variables', () => {
    const config = loadConfig({
      ...baseEnv,
      REMINDER_DAYS: '3',
      NOTIFY_CRON: '0 8 * * *',
      TZ: 'UTC',
      MAPPING_DB_PATH: '/data/custom.sqlite',
    });
    expect(config.reminderDays).toBe(3);
    expect(config.notifyCron).toBe('0 8 * * *');
    expect(config.timezone).toBe('UTC');
    expect(config.mappingDbPath).toBe('/data/custom.sqlite');
  });

  it('maps required variables through unchanged', () => {
    const config = loadConfig(baseEnv);
    expect(config.discordToken).toBe('discord-token');
    expect(config.notionToken).toBe('notion-token');
    expect(config.notionDatabaseId).toBe('db-id');
    expect(config.registerChannelId).toBe('register-channel');
    expect(config.notifyChannelId).toBe('notify-channel');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL with "Cannot find module '../src/config.js'".

- [ ] **Step 3: Implement `src/config.ts`**

```ts
export interface Config {
  discordToken: string;
  notionToken: string;
  notionDatabaseId: string;
  registerChannelId: string;
  notifyChannelId: string;
  reminderDays: number;
  notifyCron: string;
  timezone: string;
  mappingDbPath: string;
}

const REQUIRED_KEYS = [
  'DISCORD_TOKEN',
  'NOTION_TOKEN',
  'NOTION_DATABASE_ID',
  'REGISTER_CHANNEL_ID',
  'NOTIFY_CHANNEL_ID',
] as const;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  for (const key of REQUIRED_KEYS) {
    if (!env[key]) {
      throw new Error(`Missing required environment variable: ${key}`);
    }
  }

  return {
    discordToken: env.DISCORD_TOKEN!,
    notionToken: env.NOTION_TOKEN!,
    notionDatabaseId: env.NOTION_DATABASE_ID!,
    registerChannelId: env.REGISTER_CHANNEL_ID!,
    notifyChannelId: env.NOTIFY_CHANNEL_ID!,
    reminderDays: env.REMINDER_DAYS ? Number(env.REMINDER_DAYS) : 7,
    notifyCron: env.NOTIFY_CRON ?? '0 9 * * *',
    timezone: env.TZ ?? 'Asia/Tokyo',
    mappingDbPath: env.MAPPING_DB_PATH ?? './data/mapping.sqlite',
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/config.ts tests/config.test.ts
git commit -m "feat: add environment config loader"
```

---

### Task 4: Date parser

**Files:**
- Create: `src/parser/dateParser.ts`
- Test: `tests/parser/dateParser.test.ts`

**Interfaces:**
- Consumes: `startOfDay` from `../util/date.js` (Task 2).
- Produces:
```ts
export interface ParsedDate {
  date: Date;
  matchText: string;
  index: number;
}

export function extractDate(text: string, now?: Date): ParsedDate | null;
```
  Used by `src/parser/messageParser.ts` (Task 5).

- [ ] **Step 1: Write the failing tests**

```ts
// tests/parser/dateParser.test.ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL with "Cannot find module '../../src/parser/dateParser.js'".

- [ ] **Step 3: Implement `src/parser/dateParser.ts`**

```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/parser/dateParser.ts tests/parser/dateParser.test.ts
git commit -m "feat: add rule-based date parser"
```

---

### Task 5: Message parser

**Files:**
- Create: `src/parser/messageParser.ts`
- Test: `tests/parser/messageParser.test.ts`

**Interfaces:**
- Consumes: `extractDate(text, now?): ParsedDate | null` from `./dateParser.js` (Task 4).
- Produces:
```ts
export interface ParsedRegistration {
  name: string;
  expiryDate: Date;
}

export function parseRegistrationMessage(text: string, now?: Date): ParsedRegistration | null;
```
  Used by `src/discord/registerHandler.ts` (Task 8).

- [ ] **Step 1: Write the failing tests**

```ts
// tests/parser/messageParser.test.ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL with "Cannot find module '../../src/parser/messageParser.js'".

- [ ] **Step 3: Implement `src/parser/messageParser.ts`**

```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/parser/messageParser.ts tests/parser/messageParser.test.ts
git commit -m "feat: add registration message parser"
```

---

### Task 6: Mapping store (SQLite)

**Files:**
- Create: `src/db/mappingStore.ts`
- Test: `tests/db/mappingStore.test.ts`

**Interfaces:**
- Produces:
```ts
export class MappingStore {
  constructor(dbPath: string);
  saveMapping(discordMessageId: string, notionPageId: string): void;
  getNotionPageId(discordMessageId: string): string | null;
  close(): void;
}
```
  Used by `src/discord/notifyJob.ts` (Task 9) and `src/discord/reactionHandler.ts` (Task 10).

- [ ] **Step 1: Write the failing tests**

```ts
// tests/db/mappingStore.test.ts
import { describe, it, expect, afterEach } from 'vitest';
import { MappingStore } from '../../src/db/mappingStore.js';

describe('MappingStore', () => {
  let store: MappingStore;

  afterEach(() => {
    store?.close();
  });

  it('returns null for an unknown message id', () => {
    store = new MappingStore(':memory:');
    expect(store.getNotionPageId('unknown')).toBeNull();
  });

  it('saves and retrieves a mapping', () => {
    store = new MappingStore(':memory:');
    store.saveMapping('msg-1', 'page-1');
    expect(store.getNotionPageId('msg-1')).toBe('page-1');
  });

  it('overwrites an existing mapping for the same message id', () => {
    store = new MappingStore(':memory:');
    store.saveMapping('msg-1', 'page-1');
    store.saveMapping('msg-1', 'page-2');
    expect(store.getNotionPageId('msg-1')).toBe('page-2');
  });

  it('keeps mappings for different messages independent', () => {
    store = new MappingStore(':memory:');
    store.saveMapping('msg-1', 'page-1');
    store.saveMapping('msg-2', 'page-2');
    expect(store.getNotionPageId('msg-1')).toBe('page-1');
    expect(store.getNotionPageId('msg-2')).toBe('page-2');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL with "Cannot find module '../../src/db/mappingStore.js'".

- [ ] **Step 3: Implement `src/db/mappingStore.ts`**

```ts
import Database from 'better-sqlite3';

export class MappingStore {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS message_page_map (
        discord_message_id TEXT PRIMARY KEY,
        notion_page_id TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
  }

  saveMapping(discordMessageId: string, notionPageId: string): void {
    this.db
      .prepare(
        'INSERT OR REPLACE INTO message_page_map (discord_message_id, notion_page_id) VALUES (?, ?)',
      )
      .run(discordMessageId, notionPageId);
  }

  getNotionPageId(discordMessageId: string): string | null {
    const row = this.db
      .prepare('SELECT notion_page_id FROM message_page_map WHERE discord_message_id = ?')
      .get(discordMessageId) as { notion_page_id: string } | undefined;
    return row ? row.notion_page_id : null;
  }

  close(): void {
    this.db.close();
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/db/mappingStore.ts tests/db/mappingStore.test.ts
git commit -m "feat: add SQLite mapping store for message-to-page links"
```

---

### Task 7: Notion client and souvenirs module

**Files:**
- Create: `src/notion/client.ts`
- Create: `src/notion/souvenirs.ts`
- Test: `tests/notion/client.test.ts`
- Test: `tests/notion/souvenirs.test.ts`

**Interfaces:**
- Consumes: `toISODateString`, `parseISODateString` from `../util/date.js` (Task 2).
- Produces:
```ts
// src/notion/client.ts
export interface NotionClientLike {
  pages: {
    create: (args: any) => Promise<{ id: string }>;
    update: (args: any) => Promise<unknown>;
  };
  databases: {
    query: (args: any) => Promise<{ results: any[] }>;
  };
}
export function createNotionClient(token: string): NotionClientLike;

// src/notion/souvenirs.ts
export type SouvenirStatus = '未消費' | '消費済み';
export interface Souvenir {
  pageId: string;
  name: string;
  expiryDate: Date;
  status: SouvenirStatus;
}
export interface CreateSouvenirInput {
  name: string;
  expiryDate: Date;
  registeredBy: string;
  sourceMessageUrl: string;
}
export function createSouvenir(client: NotionClientLike, databaseId: string, input: CreateSouvenirInput): Promise<string>;
export function getSoonExpiring(client: NotionClientLike, databaseId: string, thresholdDate: Date): Promise<Souvenir[]>;
export function markConsumed(client: NotionClientLike, pageId: string): Promise<void>;
```
  Used by `src/discord/registerHandler.ts` (Task 8), `src/discord/notifyJob.ts` (Task 9), `src/discord/reactionHandler.ts` (Task 10).

- [ ] **Step 1: Write the failing test for the client factory**

```ts
// tests/notion/client.test.ts
import { describe, it, expect } from 'vitest';
import { createNotionClient } from '../../src/notion/client.js';

describe('createNotionClient', () => {
  it('returns an object exposing the pages and databases operations used by the app', () => {
    const client = createNotionClient('dummy-token');
    expect(typeof client.pages.create).toBe('function');
    expect(typeof client.pages.update).toBe('function');
    expect(typeof client.databases.query).toBe('function');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL with "Cannot find module '../../src/notion/client.js'".

- [ ] **Step 3: Implement `src/notion/client.ts`**

```ts
import { Client } from '@notionhq/client';

export interface NotionClientLike {
  pages: {
    create: (args: any) => Promise<{ id: string }>;
    update: (args: any) => Promise<unknown>;
  };
  databases: {
    query: (args: any) => Promise<{ results: any[] }>;
  };
}

export function createNotionClient(token: string): NotionClientLike {
  return new Client({ auth: token }) as unknown as NotionClientLike;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: passes.

- [ ] **Step 5: Write the failing tests for the souvenirs module**

```ts
// tests/notion/souvenirs.test.ts
import { describe, it, expect, vi } from 'vitest';
import { createSouvenir, getSoonExpiring, markConsumed } from '../../src/notion/souvenirs.js';
import type { NotionClientLike } from '../../src/notion/client.js';

function fakeClient(overrides: Partial<NotionClientLike> = {}): NotionClientLike {
  return {
    pages: {
      create: vi.fn(async () => ({ id: 'page-1' })),
      update: vi.fn(async () => ({})),
      ...overrides.pages,
    },
    databases: {
      query: vi.fn(async () => ({ results: [] })),
      ...overrides.databases,
    },
  };
}

describe('createSouvenir', () => {
  it('creates a Notion page with the expected properties and returns its id', async () => {
    const client = fakeClient();

    const pageId = await createSouvenir(client, 'db-1', {
      name: '八つ橋',
      expiryDate: new Date(2026, 8, 1),
      registeredBy: 'taro',
      sourceMessageUrl: 'https://discord.com/channels/1/2/3',
    });

    expect(pageId).toBe('page-1');
    expect(client.pages.create).toHaveBeenCalledWith({
      parent: { database_id: 'db-1' },
      properties: {
        商品名: { title: [{ text: { content: '八つ橋' } }] },
        賞味期限: { date: { start: '2026-09-01' } },
        ステータス: { select: { name: '未消費' } },
        登録者: { rich_text: [{ text: { content: 'taro' } }] },
        元メッセージ: { url: 'https://discord.com/channels/1/2/3' },
      },
    });
  });
});

describe('getSoonExpiring', () => {
  it('queries for unconsumed items on or before the threshold and maps the results', async () => {
    const query = vi.fn(async () => ({
      results: [
        {
          id: 'page-1',
          properties: {
            商品名: { title: [{ plain_text: '八つ橋' }] },
            賞味期限: { date: { start: '2026-09-01' } },
            ステータス: { select: { name: '未消費' } },
          },
        },
      ],
    }));
    const client = fakeClient({ databases: { query } });

    const results = await getSoonExpiring(client, 'db-1', new Date(2026, 8, 8));

    expect(query).toHaveBeenCalledWith({
      database_id: 'db-1',
      filter: {
        and: [
          { property: 'ステータス', select: { equals: '未消費' } },
          { property: '賞味期限', date: { on_or_before: '2026-09-08' } },
        ],
      },
      sorts: [{ property: '賞味期限', direction: 'ascending' }],
    });
    expect(results).toEqual([
      {
        pageId: 'page-1',
        name: '八つ橋',
        expiryDate: new Date(2026, 8, 1),
        status: '未消費',
      },
    ]);
  });
});

describe('markConsumed', () => {
  it('updates the page status to 消費済み', async () => {
    const update = vi.fn(async () => ({}));
    const client = fakeClient({ pages: { create: vi.fn(), update } });

    await markConsumed(client, 'page-1');

    expect(update).toHaveBeenCalledWith({
      page_id: 'page-1',
      properties: {
        ステータス: { select: { name: '消費済み' } },
      },
    });
  });
});
```

- [ ] **Step 6: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL with "Cannot find module '../../src/notion/souvenirs.js'".

- [ ] **Step 7: Implement `src/notion/souvenirs.ts`**

```ts
import { toISODateString, parseISODateString } from '../util/date.js';
import type { NotionClientLike } from './client.js';

export type SouvenirStatus = '未消費' | '消費済み';

export interface Souvenir {
  pageId: string;
  name: string;
  expiryDate: Date;
  status: SouvenirStatus;
}

export interface CreateSouvenirInput {
  name: string;
  expiryDate: Date;
  registeredBy: string;
  sourceMessageUrl: string;
}

export async function createSouvenir(
  client: NotionClientLike,
  databaseId: string,
  input: CreateSouvenirInput,
): Promise<string> {
  const response = await client.pages.create({
    parent: { database_id: databaseId },
    properties: {
      商品名: { title: [{ text: { content: input.name } }] },
      賞味期限: { date: { start: toISODateString(input.expiryDate) } },
      ステータス: { select: { name: '未消費' } },
      登録者: { rich_text: [{ text: { content: input.registeredBy } }] },
      元メッセージ: { url: input.sourceMessageUrl },
    },
  });
  return response.id;
}

export async function getSoonExpiring(
  client: NotionClientLike,
  databaseId: string,
  thresholdDate: Date,
): Promise<Souvenir[]> {
  const response = await client.databases.query({
    database_id: databaseId,
    filter: {
      and: [
        { property: 'ステータス', select: { equals: '未消費' } },
        { property: '賞味期限', date: { on_or_before: toISODateString(thresholdDate) } },
      ],
    },
    sorts: [{ property: '賞味期限', direction: 'ascending' }],
  });

  return response.results.map((page: any) => ({
    pageId: page.id,
    name: page.properties.商品名.title[0]?.plain_text ?? '',
    expiryDate: parseISODateString(page.properties.賞味期限.date.start),
    status: page.properties.ステータス.select.name as SouvenirStatus,
  }));
}

export async function markConsumed(client: NotionClientLike, pageId: string): Promise<void> {
  await client.pages.update({
    page_id: pageId,
    properties: {
      ステータス: { select: { name: '消費済み' } },
    },
  });
}
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 9: Commit**

```bash
git add src/notion/client.ts src/notion/souvenirs.ts tests/notion/client.test.ts tests/notion/souvenirs.test.ts
git commit -m "feat: add Notion client wrapper and souvenirs data access"
```

---

### Task 8: Register handler

**Files:**
- Create: `src/discord/registerHandler.ts`
- Test: `tests/discord/registerHandler.test.ts`

**Interfaces:**
- Consumes: `parseRegistrationMessage` from `../parser/messageParser.js` (Task 5); `createSouvenir`, `NotionClientLike` from `../notion/souvenirs.js` / `../notion/client.js` (Task 7).
- Produces:
```ts
export interface RegisterableMessage {
  channelId: string;
  author: { bot: boolean; username: string };
  content: string;
  url: string;
  member: { displayName: string } | null;
  react: (emoji: string) => Promise<unknown>;
  reply: (content: string) => Promise<unknown>;
}
export interface RegisterHandlerDeps {
  notionClient: NotionClientLike;
  databaseId: string;
  registerChannelId: string;
}
export function createRegisterHandler(deps: RegisterHandlerDeps): (message: RegisterableMessage) => Promise<void>;
```
  Used by `src/index.ts` (Task 11).

- [ ] **Step 1: Write the failing tests**

```ts
// tests/discord/registerHandler.test.ts
import { describe, it, expect, vi } from 'vitest';
import { createRegisterHandler, type RegisterableMessage } from '../../src/discord/registerHandler.js';
import type { NotionClientLike } from '../../src/notion/client.js';

function fakeMessage(overrides: Partial<RegisterableMessage> = {}): RegisterableMessage {
  return {
    channelId: 'register-channel',
    author: { bot: false, username: 'taro' },
    content: '八つ橋 賞味期限 2026年9月1日',
    url: 'https://discord.com/channels/1/2/3',
    member: { displayName: 'たろう' },
    react: vi.fn(async () => {}),
    reply: vi.fn(async () => {}),
    ...overrides,
  };
}

function fakeNotionClient(): NotionClientLike {
  return {
    pages: {
      create: vi.fn(async () => ({ id: 'page-1' })),
      update: vi.fn(async () => ({})),
    },
    databases: {
      query: vi.fn(async () => ({ results: [] })),
    },
  };
}

describe('registerHandler', () => {
  it('ignores messages outside the register channel', async () => {
    const notionClient = fakeNotionClient();
    const handle = createRegisterHandler({
      notionClient,
      databaseId: 'db-1',
      registerChannelId: 'register-channel',
    });
    const message = fakeMessage({ channelId: 'other-channel' });

    await handle(message);

    expect(notionClient.pages.create).not.toHaveBeenCalled();
    expect(message.react).not.toHaveBeenCalled();
  });

  it('ignores messages from bots', async () => {
    const notionClient = fakeNotionClient();
    const handle = createRegisterHandler({
      notionClient,
      databaseId: 'db-1',
      registerChannelId: 'register-channel',
    });
    const message = fakeMessage({ author: { bot: true, username: 'other-bot' } });

    await handle(message);

    expect(notionClient.pages.create).not.toHaveBeenCalled();
  });

  it('creates a souvenir and reacts with ✅ on a parseable message', async () => {
    const notionClient = fakeNotionClient();
    const handle = createRegisterHandler({
      notionClient,
      databaseId: 'db-1',
      registerChannelId: 'register-channel',
    });
    const message = fakeMessage();

    await handle(message);

    expect(notionClient.pages.create).toHaveBeenCalledWith(
      expect.objectContaining({
        properties: expect.objectContaining({
          商品名: { title: [{ text: { content: '八つ橋' } }] },
          登録者: { rich_text: [{ text: { content: 'たろう' } }] },
          元メッセージ: { url: 'https://discord.com/channels/1/2/3' },
        }),
      }),
    );
    expect(message.react).toHaveBeenCalledWith('✅');
  });

  it('reacts with ❌ and replies with an error message when Notion creation fails', async () => {
    const notionClient = fakeNotionClient();
    notionClient.pages.create = vi.fn(async () => {
      throw new Error('Notion is down');
    });
    const handle = createRegisterHandler({
      notionClient,
      databaseId: 'db-1',
      registerChannelId: 'register-channel',
    });
    const message = fakeMessage();

    await handle(message);

    expect(message.react).toHaveBeenCalledWith('❌');
    expect(message.reply).toHaveBeenCalledWith(expect.stringContaining('Notion'));
  });

  it('falls back to the username when the member display name is unavailable', async () => {
    const notionClient = fakeNotionClient();
    const handle = createRegisterHandler({
      notionClient,
      databaseId: 'db-1',
      registerChannelId: 'register-channel',
    });
    const message = fakeMessage({ member: null });

    await handle(message);

    expect(notionClient.pages.create).toHaveBeenCalledWith(
      expect.objectContaining({
        properties: expect.objectContaining({
          登録者: { rich_text: [{ text: { content: 'taro' } }] },
        }),
      }),
    );
  });

  it('reacts with ❌ and replies with a format guide when the message cannot be parsed', async () => {
    const notionClient = fakeNotionClient();
    const handle = createRegisterHandler({
      notionClient,
      databaseId: 'db-1',
      registerChannelId: 'register-channel',
    });
    const message = fakeMessage({ content: 'おいしかったです' });

    await handle(message);

    expect(notionClient.pages.create).not.toHaveBeenCalled();
    expect(message.react).toHaveBeenCalledWith('❌');
    expect(message.reply).toHaveBeenCalledWith(expect.stringContaining('賞味期限'));
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL with "Cannot find module '../../src/discord/registerHandler.js'".

- [ ] **Step 3: Implement `src/discord/registerHandler.ts`**

```ts
import { parseRegistrationMessage } from '../parser/messageParser.js';
import { createSouvenir } from '../notion/souvenirs.js';
import type { NotionClientLike } from '../notion/client.js';

export interface RegisterableMessage {
  channelId: string;
  author: { bot: boolean; username: string };
  content: string;
  url: string;
  member: { displayName: string } | null;
  react: (emoji: string) => Promise<unknown>;
  reply: (content: string) => Promise<unknown>;
}

export interface RegisterHandlerDeps {
  notionClient: NotionClientLike;
  databaseId: string;
  registerChannelId: string;
}

const FORMAT_GUIDE =
  '賞味期限を認識できませんでした。例: `京都の八つ橋 賞味期限 2026年9月1日` のように商品名と日付を入れて送ってください。';

export function createRegisterHandler(deps: RegisterHandlerDeps) {
  return async function handleMessage(message: RegisterableMessage): Promise<void> {
    if (message.channelId !== deps.registerChannelId) return;
    if (message.author.bot) return;

    const parsed = parseRegistrationMessage(message.content);
    if (!parsed) {
      await message.react('❌');
      await message.reply(FORMAT_GUIDE);
      return;
    }

    try {
      await createSouvenir(deps.notionClient, deps.databaseId, {
        name: parsed.name,
        expiryDate: parsed.expiryDate,
        registeredBy: message.member?.displayName ?? message.author.username,
        sourceMessageUrl: message.url,
      });
    } catch (error) {
      console.error('Failed to create Notion page for souvenir', error);
      await message.react('❌');
      await message.reply('Notionへの登録に失敗しました。時間をおいて再度お試しください。');
      return;
    }

    await message.react('✅');
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/discord/registerHandler.ts tests/discord/registerHandler.test.ts
git commit -m "feat: add register channel message handler"
```

---

### Task 9: Notify job

**Files:**
- Create: `src/discord/notifyJob.ts`
- Test: `tests/discord/notifyJob.test.ts`

**Interfaces:**
- Consumes: `getSoonExpiring` from `../notion/souvenirs.js` (Task 7); `MappingStore` from `../db/mappingStore.js` (Task 6); `addDays`, `startOfDay` from `../util/date.js` (Task 2).
- Produces:
```ts
export interface SendableMessage {
  id: string;
  react: (emoji: string) => Promise<unknown>;
}
export interface NotifiableChannel {
  send: (content: string) => Promise<SendableMessage>;
}
export interface NotifyJobDeps {
  notionClient: NotionClientLike;
  databaseId: string;
  channel: NotifiableChannel;
  mappingStore: MappingStore;
  reminderDays: number;
}
export function runNotifyJob(deps: NotifyJobDeps, now?: Date): Promise<void>;
```
  Used by `src/index.ts` (Task 11).

- [ ] **Step 1: Write the failing tests**

```ts
// tests/discord/notifyJob.test.ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { runNotifyJob, type NotifiableChannel, type SendableMessage } from '../../src/discord/notifyJob.js';
import { MappingStore } from '../../src/db/mappingStore.js';
import type { NotionClientLike } from '../../src/notion/client.js';

function fakeNotionClient(results: any[]): NotionClientLike {
  return {
    pages: { create: vi.fn(), update: vi.fn() },
    databases: { query: vi.fn(async () => ({ results })) },
  };
}

function fakeChannel(): NotifiableChannel & { sent: string[] } {
  const sent: string[] = [];
  let counter = 0;
  return {
    sent,
    send: vi.fn(async (content: string) => {
      sent.push(content);
      counter += 1;
      const message: SendableMessage = {
        id: `msg-${counter}`,
        react: vi.fn(async () => {}),
      };
      return message;
    }),
  };
}

describe('runNotifyJob', () => {
  let mappingStore: MappingStore;

  afterEach(() => {
    mappingStore?.close();
  });

  it('posts one message per item and records the message-to-page mapping', async () => {
    const notionClient = fakeNotionClient([
      {
        id: 'page-1',
        properties: {
          商品名: { title: [{ plain_text: '八つ橋' }] },
          賞味期限: { date: { start: '2026-09-05' } },
          ステータス: { select: { name: '未消費' } },
        },
      },
    ]);
    const channel = fakeChannel();
    mappingStore = new MappingStore(':memory:');

    await runNotifyJob(
      {
        notionClient,
        databaseId: 'db-1',
        channel,
        mappingStore,
        reminderDays: 7,
      },
      new Date(2026, 8, 1),
    );

    expect(channel.sent).toHaveLength(1);
    expect(channel.sent[0]).toContain('八つ橋');
    expect(channel.sent[0]).not.toContain('⚠️期限切れ');
    expect(mappingStore.getNotionPageId('msg-1')).toBe('page-1');
  });

  it('labels overdue items and still notifies about them', async () => {
    const notionClient = fakeNotionClient([
      {
        id: 'page-1',
        properties: {
          商品名: { title: [{ plain_text: '八つ橋' }] },
          賞味期限: { date: { start: '2026-08-20' } },
          ステータス: { select: { name: '未消費' } },
        },
      },
    ]);
    const channel = fakeChannel();
    mappingStore = new MappingStore(':memory:');

    await runNotifyJob(
      {
        notionClient,
        databaseId: 'db-1',
        channel,
        mappingStore,
        reminderDays: 7,
      },
      new Date(2026, 8, 1),
    );

    expect(channel.sent[0]).toContain('⚠️期限切れ');
  });

  it('does nothing when there are no items to notify about', async () => {
    const notionClient = fakeNotionClient([]);
    const channel = fakeChannel();
    mappingStore = new MappingStore(':memory:');

    await runNotifyJob(
      { notionClient, databaseId: 'db-1', channel, mappingStore, reminderDays: 7 },
      new Date(2026, 8, 1),
    );

    expect(channel.send).not.toHaveBeenCalled();
  });

  it('queries using today plus the configured reminder days as the threshold', async () => {
    const query = vi.fn(async () => ({ results: [] }));
    const notionClient: NotionClientLike = {
      pages: { create: vi.fn(), update: vi.fn() },
      databases: { query },
    };
    const channel = fakeChannel();
    mappingStore = new MappingStore(':memory:');

    await runNotifyJob(
      { notionClient, databaseId: 'db-1', channel, mappingStore, reminderDays: 3 },
      new Date(2026, 8, 1),
    );

    expect(query).toHaveBeenCalledWith(
      expect.objectContaining({
        filter: expect.objectContaining({
          and: expect.arrayContaining([
            { property: '賞味期限', date: { on_or_before: '2026-09-04' } },
          ]),
        }),
      }),
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL with "Cannot find module '../../src/discord/notifyJob.js'".

- [ ] **Step 3: Implement `src/discord/notifyJob.ts`**

```ts
import { addDays, startOfDay } from '../util/date.js';
import { getSoonExpiring } from '../notion/souvenirs.js';
import type { NotionClientLike } from '../notion/client.js';
import type { MappingStore } from '../db/mappingStore.js';

export interface SendableMessage {
  id: string;
  react: (emoji: string) => Promise<unknown>;
}

export interface NotifiableChannel {
  send: (content: string) => Promise<SendableMessage>;
}

export interface NotifyJobDeps {
  notionClient: NotionClientLike;
  databaseId: string;
  channel: NotifiableChannel;
  mappingStore: MappingStore;
  reminderDays: number;
}

export async function runNotifyJob(deps: NotifyJobDeps, now: Date = new Date()): Promise<void> {
  const threshold = addDays(now, deps.reminderDays);
  const items = await getSoonExpiring(deps.notionClient, deps.databaseId, threshold);
  const today = startOfDay(now);

  for (const item of items) {
    const isOverdue = item.expiryDate < today;
    const label = isOverdue ? '⚠️期限切れ: ' : '';
    const text = `${label}${item.name}(賞味期限: ${formatJapaneseDate(item.expiryDate)})`;

    const sent = await deps.channel.send(text);
    await sent.react('✅');
    deps.mappingStore.saveMapping(sent.id, item.pageId);
  }
}

function formatJapaneseDate(date: Date): string {
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/discord/notifyJob.ts tests/discord/notifyJob.test.ts
git commit -m "feat: add daily notification job"
```

---

### Task 10: Reaction handler

**Files:**
- Create: `src/discord/reactionHandler.ts`
- Test: `tests/discord/reactionHandler.test.ts`

**Interfaces:**
- Consumes: `markConsumed` from `../notion/souvenirs.js` (Task 7); `MappingStore` from `../db/mappingStore.js` (Task 6).
- Produces:
```ts
export interface ReactableUser {
  id: string;
  bot: boolean;
}
export interface ReactableMessage {
  id: string;
}
export interface ReactionLike {
  emoji: { name: string | null };
  message: ReactableMessage;
}
export interface ReactionHandlerDeps {
  notionClient: NotionClientLike;
  mappingStore: MappingStore;
}
export function createReactionHandler(deps: ReactionHandlerDeps): (reaction: ReactionLike, user: ReactableUser) => Promise<void>;
```
  Used by `src/index.ts` (Task 11).

- [ ] **Step 1: Write the failing tests**

```ts
// tests/discord/reactionHandler.test.ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createReactionHandler } from '../../src/discord/reactionHandler.js';
import { MappingStore } from '../../src/db/mappingStore.js';
import type { NotionClientLike } from '../../src/notion/client.js';

function fakeNotionClient(): NotionClientLike {
  return {
    pages: { create: vi.fn(), update: vi.fn(async () => ({})) },
    databases: { query: vi.fn(async () => ({ results: [] })) },
  };
}

describe('reactionHandler', () => {
  let mappingStore: MappingStore;

  afterEach(() => {
    mappingStore?.close();
  });

  it('marks the mapped page as consumed on a user ✅ reaction', async () => {
    const notionClient = fakeNotionClient();
    mappingStore = new MappingStore(':memory:');
    mappingStore.saveMapping('msg-1', 'page-1');
    const handle = createReactionHandler({ notionClient, mappingStore });

    await handle(
      { emoji: { name: '✅' }, message: { id: 'msg-1' } },
      { id: 'user-1', bot: false },
    );

    expect(notionClient.pages.update).toHaveBeenCalledWith({
      page_id: 'page-1',
      properties: { ステータス: { select: { name: '消費済み' } } },
    });
  });

  it('ignores reactions from bots (including the bot itself)', async () => {
    const notionClient = fakeNotionClient();
    mappingStore = new MappingStore(':memory:');
    mappingStore.saveMapping('msg-1', 'page-1');
    const handle = createReactionHandler({ notionClient, mappingStore });

    await handle(
      { emoji: { name: '✅' }, message: { id: 'msg-1' } },
      { id: 'bot-1', bot: true },
    );

    expect(notionClient.pages.update).not.toHaveBeenCalled();
  });

  it('ignores reactions with a different emoji', async () => {
    const notionClient = fakeNotionClient();
    mappingStore = new MappingStore(':memory:');
    mappingStore.saveMapping('msg-1', 'page-1');
    const handle = createReactionHandler({ notionClient, mappingStore });

    await handle(
      { emoji: { name: '👍' }, message: { id: 'msg-1' } },
      { id: 'user-1', bot: false },
    );

    expect(notionClient.pages.update).not.toHaveBeenCalled();
  });

  it('ignores reactions on messages with no known mapping', async () => {
    const notionClient = fakeNotionClient();
    mappingStore = new MappingStore(':memory:');
    const handle = createReactionHandler({ notionClient, mappingStore });

    await handle(
      { emoji: { name: '✅' }, message: { id: 'unmapped-message' } },
      { id: 'user-1', bot: false },
    );

    expect(notionClient.pages.update).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL with "Cannot find module '../../src/discord/reactionHandler.js'".

- [ ] **Step 3: Implement `src/discord/reactionHandler.ts`**

```ts
import { markConsumed } from '../notion/souvenirs.js';
import type { NotionClientLike } from '../notion/client.js';
import type { MappingStore } from '../db/mappingStore.js';

export interface ReactableUser {
  id: string;
  bot: boolean;
}

export interface ReactableMessage {
  id: string;
}

export interface ReactionLike {
  emoji: { name: string | null };
  message: ReactableMessage;
}

export interface ReactionHandlerDeps {
  notionClient: NotionClientLike;
  mappingStore: MappingStore;
}

export function createReactionHandler(deps: ReactionHandlerDeps) {
  return async function handleReaction(
    reaction: ReactionLike,
    user: ReactableUser,
  ): Promise<void> {
    if (user.bot) return;
    if (reaction.emoji.name !== '✅') return;

    const pageId = deps.mappingStore.getNotionPageId(reaction.message.id);
    if (!pageId) return;

    await markConsumed(deps.notionClient, pageId);
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/discord/reactionHandler.ts tests/discord/reactionHandler.test.ts
git commit -m "feat: add completion reaction handler"
```

---

### Task 11: Bot entrypoint, Docker, and README

**Files:**
- Create: `src/index.ts` (replacing the `export {};` placeholder from Task 1)
- Create: `Dockerfile`
- Create: `README.md`

**Interfaces:**
- Consumes every module produced by Tasks 2–10: `loadConfig`, `createNotionClient`, `MappingStore`, `createRegisterHandler`, `createReactionHandler`, `runNotifyJob`.
- Produces: the running process — no further module depends on this file.

- [ ] **Step 1: Implement `src/index.ts`**

```ts
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { Client, GatewayIntentBits, Partials } from 'discord.js';
import cron from 'node-cron';
import { loadConfig } from './config.js';
import { createNotionClient } from './notion/client.js';
import { MappingStore } from './db/mappingStore.js';
import { createRegisterHandler } from './discord/registerHandler.js';
import { createReactionHandler } from './discord/reactionHandler.js';
import { runNotifyJob } from './discord/notifyJob.js';

const config = loadConfig();

fs.mkdirSync(path.dirname(config.mappingDbPath), { recursive: true });
const mappingStore = new MappingStore(config.mappingDbPath);
const notionClient = createNotionClient(config.notionToken);

const discordClient = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions,
  ],
  partials: [Partials.Message, Partials.Reaction, Partials.Channel],
});

const handleRegisterMessage = createRegisterHandler({
  notionClient,
  databaseId: config.notionDatabaseId,
  registerChannelId: config.registerChannelId,
});

discordClient.on('messageCreate', (message) => {
  handleRegisterMessage(message).catch((error) => {
    console.error('Failed to handle register message', error);
  });
});

const handleReaction = createReactionHandler({ notionClient, mappingStore });

discordClient.on('messageReactionAdd', async (reaction, user) => {
  try {
    if (reaction.partial) await reaction.fetch();
    if (user.partial) await user.fetch();
    await handleReaction(reaction, user);
  } catch (error) {
    console.error('Failed to handle reaction', error);
  }
});

discordClient.once('ready', () => {
  console.log(`Logged in as ${discordClient.user?.tag}`);

  cron.schedule(
    config.notifyCron,
    () => {
      notifyChannel().catch((error) => {
        console.error('Failed to run notify job', error);
      });
    },
    { timezone: config.timezone },
  );
});

async function notifyChannel(): Promise<void> {
  const channel = await discordClient.channels.fetch(config.notifyChannelId);
  if (!channel?.isTextBased()) {
    throw new Error(`Notify channel ${config.notifyChannelId} is not a text channel`);
  }

  await runNotifyJob({
    notionClient,
    databaseId: config.notionDatabaseId,
    channel,
    mappingStore,
    reminderDays: config.reminderDays,
  });
}

discordClient.login(config.discordToken);
```

- [ ] **Step 2: Verify the project builds**

Run: `npm run build`
Expected: succeeds with no type errors.

- [ ] **Step 3: Verify the full test suite still passes**

Run: `npm test`
Expected: all tests across every task pass.

- [ ] **Step 4: Create `Dockerfile`**

```dockerfile
FROM node:22-slim

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm install

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

ENV NODE_ENV=production
VOLUME ["/app/data"]

CMD ["node", "dist/index.js"]
```

- [ ] **Step 5: Create `README.md`**

```markdown
# ExpiryBot

お土産の賞味期限をNotionで管理するDiscord Bot。

## できること

- 登録専用チャンネルに「商品名 賞味期限 日付」のようなメッセージを送るとNotionに登録され、✅リアクションが付く
- 毎朝、期限が近い(デフォルト7日以内)お土産を1件ずつ通知チャンネルに投稿
- 通知メッセージに✅リアクションをつけると、その商品をNotion上で消費済みにする

## セットアップ

### 1. Notion側

1. https://www.notion.so/my-integrations でIntegrationを作成し、Tokenを控える
2. 次のプロパティを持つデータベースを作成する
   - `商品名` (Title)
   - `賞味期限` (Date)
   - `ステータス` (Select: `未消費`, `消費済み`)
   - `登録者` (Text)
   - `元メッセージ` (URL)
3. データベース右上の「Connections」から、作成したIntegrationを接続する
4. データベースURLからデータベースIDを控える

### 2. Discord側

1. https://discord.com/developers/applications でBotを作成する
2. 「Bot」設定で `MESSAGE CONTENT INTENT` を有効化する
3. OAuth2 URL Generatorで `bot` スコープ、`Send Messages` / `Read Message History` / `Add Reactions` 権限を選び、サーバーに招待する
4. 登録専用チャンネルと通知先チャンネルのIDを控える(開発者モードを有効にして右クリック→IDをコピー)

### 3. 環境変数

`.env.example` を `.env` にコピーし、以下を埋める。

```
DISCORD_TOKEN=
NOTION_TOKEN=
NOTION_DATABASE_ID=
REGISTER_CHANNEL_ID=
NOTIFY_CHANNEL_ID=
REMINDER_DAYS=7
NOTIFY_CRON=0 9 * * *
TZ=Asia/Tokyo
MAPPING_DB_PATH=./data/mapping.sqlite
```

## ローカル実行

```bash
npm install
npm run build
npm start
```

開発中は `npm run dev` でホットリロード実行できる。

## Docker実行

```bash
docker build -t expirybot .
docker run -d \
  --name expirybot \
  --env-file .env \
  -v "$(pwd)/data:/app/data" \
  --restart unless-stopped \
  expirybot
```

`data/` ディレクトリはDiscordメッセージ↔Notionページの対応表(SQLite)を保存する。コンテナを再作成してもここをマウントしておけば消えない。

## 運用メモ

- 通知時刻を変えたい場合は `NOTIFY_CRON` を変更する(cron形式、タイムゾーンは `TZ` に従う)
- 通知対象にする残り日数を変えたい場合は `REMINDER_DAYS` を変更する
```

- [ ] **Step 6: Commit**

```bash
git add src/index.ts Dockerfile README.md
git commit -m "feat: wire up bot entrypoint and add Docker/README"
```

---

## Post-Plan Manual Verification (not automated)

The plan above is fully covered by unit tests except for the actual Discord/Notion wiring in `src/index.ts`, which needs a real bot token and Notion integration to exercise. After implementation, the user should:

1. Follow the README to create the Notion database and Discord bot.
2. Run the bot (locally or via Docker) and post a test message like `テスト お菓子 賞味期限 2026年9月1日` in the register channel — confirm a ✅ reaction appears and a page shows up in Notion.
3. Temporarily set `NOTIFY_CRON` to a time a minute or two in the future (or manually call `notifyChannel()` once from a scratch script) to confirm the daily message appears in the notify channel with the correct format.
4. React ✅ on that notification message and confirm the Notion page's ステータス flips to `消費済み`.
