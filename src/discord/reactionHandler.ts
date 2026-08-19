import { markConsumed } from '../notion/souvenirs.js';
import type { NotionClientLike } from '../notion/client.js';
import type { MappingStore } from '../db/mappingStore.js';

export interface ReactableUser {
  id: string;
  bot: boolean;
}

export interface ReactableMessage {
  id: string;
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

    await markConsumed(deps.notionClient, pageId);
  };
}
