import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { Client, GatewayIntentBits, Partials } from 'discord.js';
import cron from 'node-cron';
import { loadConfig } from './config.js';
import { createNotionClient } from './notion/client.js';
import { MappingStore } from './db/mappingStore.js';
import { createRegisterHandler } from './discord/registerHandler.js';
import { createReactionHandler } from './discord/reactionHandler.js';
import { runNotifyJob } from './discord/notifyJob.js';

const config = loadConfig();
process.env.TZ = config.timezone;

fs.mkdirSync(path.dirname(config.mappingDbPath), { recursive: true });
const mappingStore = new MappingStore(config.mappingDbPath);
const notionClient = createNotionClient(config.notionToken);

const discordClient = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions,
  ],
  partials: [Partials.Message, Partials.Reaction, Partials.Channel],
});

const handleRegisterMessage = createRegisterHandler({
  notionClient,
  databaseId: config.notionDatabaseId,
  registerChannelId: config.registerChannelId,
});

discordClient.on('messageCreate', (message) => {
  handleRegisterMessage(message).catch((error) => {
    console.error('Failed to handle register message', error);
  });
});

const handleReaction = createReactionHandler({ notionClient, mappingStore });

discordClient.on('messageReactionAdd', async (reaction, user) => {
  try {
    if (reaction.partial) await reaction.fetch();
    if (user.partial) await user.fetch();
    await handleReaction(reaction, user);
  } catch (error) {
    console.error('Failed to handle reaction', error);
  }
});

discordClient.once('ready', () => {
  console.log(`Logged in as ${discordClient.user?.tag}`);

  cron.schedule(
    config.notifyCron,
    () => {
      notifyChannel().catch((error) => {
        console.error('Failed to run notify job', error);
      });
    },
    { timezone: config.timezone },
  );
});

async function notifyChannel(): Promise<void> {
  const channel = await discordClient.channels.fetch(config.notifyChannelId);
  if (!channel?.isSendable()) {
    throw new Error(`Notify channel ${config.notifyChannelId} is not a text channel`);
  }

  await runNotifyJob({
    notionClient,
    databaseId: config.notionDatabaseId,
    channel,
    mappingStore,
    reminderDays: config.reminderDays,
  });
}

discordClient.login(config.discordToken);
