import { markConsumed } from '../notion/souvenirs.js';
import type { NotionClientLike } from '../notion/client.js';
import type { MappingStore } from '../db/mappingStore.js';

export interface ReactableUser {
  id: string;
  bot: boolean;
}

export interface ReactableMessage {
  id: string;
  react: (emoji: string) => Promise<unknown>;
}

export interface ReactionLike {
  emoji: { name: string | null };
  message: ReactableMessage;
}

export interface ReactionHandlerDeps {
  notionClient: NotionClientLike;
  mappingStore: MappingStore;
}

export function createReactionHandler(deps: ReactionHandlerDeps) {
  return async function handleReaction(
    reaction: ReactionLike,
    user: ReactableUser,
  ): Promise<void> {
    if (user.bot) return;
    if (reaction.emoji.name !== '✅') return;

    const pageId = deps.mappingStore.getNotionPageId(reaction.message.id);
    if (!pageId) return;

    try {
      await markConsumed(deps.notionClient, pageId);
    } catch (error) {
      console.error('Failed to mark souvenir as consumed', error);
      await reaction.message.react('❌').catch(() => {});
    }
  };
}
