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
