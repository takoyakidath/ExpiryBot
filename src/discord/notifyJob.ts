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
