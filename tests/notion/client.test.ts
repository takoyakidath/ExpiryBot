import { describe, it, expect } from 'vitest';
import { createNotionClient } from '../../src/notion/client.js';

describe('createNotionClient', () => {
  it('returns an object exposing the pages and databases operations used by the app', () => {
    const client = createNotionClient('dummy-token');
    expect(typeof client.pages.create).toBe('function');
    expect(typeof client.pages.update).toBe('function');
    expect(typeof client.databases.query).toBe('function');
  });
});
