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
