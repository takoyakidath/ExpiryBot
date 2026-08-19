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
