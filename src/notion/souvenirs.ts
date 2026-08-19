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
