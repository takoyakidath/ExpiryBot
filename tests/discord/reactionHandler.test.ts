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
