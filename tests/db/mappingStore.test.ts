import { describe, it, expect, afterEach } from 'vitest';
import { MappingStore } from '../../src/db/mappingStore.js';

describe('MappingStore', () => {
  let store: MappingStore;

  afterEach(() => {
    store?.close();
  });

  it('returns null for an unknown message id', () => {
    store = new MappingStore(':memory:');
    expect(store.getNotionPageId('unknown')).toBeNull();
  });

  it('saves and retrieves a mapping', () => {
    store = new MappingStore(':memory:');
    store.saveMapping('msg-1', 'page-1');
    expect(store.getNotionPageId('msg-1')).toBe('page-1');
  });

  it('overwrites an existing mapping for the same message id', () => {
    store = new MappingStore(':memory:');
    store.saveMapping('msg-1', 'page-1');
    store.saveMapping('msg-1', 'page-2');
    expect(store.getNotionPageId('msg-1')).toBe('page-2');
  });

  it('keeps mappings for different messages independent', () => {
    store = new MappingStore(':memory:');
    store.saveMapping('msg-1', 'page-1');
    store.saveMapping('msg-2', 'page-2');
    expect(store.getNotionPageId('msg-1')).toBe('page-1');
    expect(store.getNotionPageId('msg-2')).toBe('page-2');
  });
});
