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
