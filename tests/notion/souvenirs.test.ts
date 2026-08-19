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
