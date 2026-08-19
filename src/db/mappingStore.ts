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
