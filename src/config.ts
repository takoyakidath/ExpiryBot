import cron from 'node-cron';

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

  const reminderDays = env.REMINDER_DAYS ? Number(env.REMINDER_DAYS) : 7;
  if (!Number.isFinite(reminderDays) || reminderDays < 0) {
    throw new Error(`Invalid REMINDER_DAYS: ${env.REMINDER_DAYS}`);
  }

  const notifyCron = env.NOTIFY_CRON ?? '0 9 * * *';
  if (!cron.validate(notifyCron)) {
    throw new Error(`Invalid NOTIFY_CRON: ${notifyCron}`);
  }

  const timezone = env.TZ ?? 'Asia/Tokyo';
  try {
    new Intl.DateTimeFormat(undefined, { timeZone: timezone });
  } catch {
    throw new Error(`Invalid TZ: ${timezone}`);
  }

  return {
    discordToken: env.DISCORD_TOKEN!,
    notionToken: env.NOTION_TOKEN!,
    notionDatabaseId: env.NOTION_DATABASE_ID!,
    registerChannelId: env.REGISTER_CHANNEL_ID!,
    notifyChannelId: env.NOTIFY_CHANNEL_ID!,
    reminderDays,
    notifyCron,
    timezone,
    mappingDbPath: env.MAPPING_DB_PATH ?? './data/mapping.sqlite',
  };
}
