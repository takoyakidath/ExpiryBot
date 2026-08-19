import { describe, it, expect } from 'vitest';
import { loadConfig } from '../src/config.js';

const baseEnv = {
  DISCORD_TOKEN: 'discord-token',
  NOTION_TOKEN: 'notion-token',
  NOTION_DATABASE_ID: 'db-id',
  REGISTER_CHANNEL_ID: 'register-channel',
  NOTIFY_CHANNEL_ID: 'notify-channel',
};

describe('loadConfig', () => {
  it('throws when a required variable is missing', () => {
    const { DISCORD_TOKEN, ...rest } = baseEnv;
    expect(() => loadConfig(rest)).toThrow(/DISCORD_TOKEN/);
  });

  it('applies defaults for optional variables', () => {
    const config = loadConfig(baseEnv);
    expect(config.reminderDays).toBe(7);
    expect(config.notifyCron).toBe('0 9 * * *');
    expect(config.timezone).toBe('Asia/Tokyo');
    expect(config.mappingDbPath).toBe('./data/mapping.sqlite');
  });

  it('honors overrides for optional variables', () => {
    const config = loadConfig({
      ...baseEnv,
      REMINDER_DAYS: '3',
      NOTIFY_CRON: '0 8 * * *',
      TZ: 'UTC',
      MAPPING_DB_PATH: '/data/custom.sqlite',
    });
    expect(config.reminderDays).toBe(3);
    expect(config.notifyCron).toBe('0 8 * * *');
    expect(config.timezone).toBe('UTC');
    expect(config.mappingDbPath).toBe('/data/custom.sqlite');
  });

  it('throws when REMINDER_DAYS is a non-numeric string', () => {
    expect(() => loadConfig({ ...baseEnv, REMINDER_DAYS: 'abc' })).toThrow(/REMINDER_DAYS/);
  });

  it('throws when NOTIFY_CRON is an invalid cron expression', () => {
    expect(() => loadConfig({ ...baseEnv, NOTIFY_CRON: 'not a cron' })).toThrow(/NOTIFY_CRON/);
  });

  it('throws when TZ is an invalid timezone name', () => {
    expect(() => loadConfig({ ...baseEnv, TZ: 'Not/AZone' })).toThrow(/TZ/);
  });

  it('maps required variables through unchanged', () => {
    const config = loadConfig(baseEnv);
    expect(config.discordToken).toBe('discord-token');
    expect(config.notionToken).toBe('notion-token');
    expect(config.notionDatabaseId).toBe('db-id');
    expect(config.registerChannelId).toBe('register-channel');
    expect(config.notifyChannelId).toBe('notify-channel');
  });
});
