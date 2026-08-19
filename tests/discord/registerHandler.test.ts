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
