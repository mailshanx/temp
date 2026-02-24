import { describe, expect, it, vi } from 'vitest';
import { ToolRegistry } from '../src/tool-registry.js';

vi.mock('../src/logger.js', () => {
  return {
    default: {
      info: vi.fn(),
      error: vi.fn(),
    },
  };
});

vi.mock('../src/generated/client.js', () => {
  return {
    api: {
      endpoints: [
        {
          alias: 'list-mail-messages',
          method: 'get',
          path: '/me/messages',
          parameters: [],
        },
        {
          alias: 'send-mail',
          method: 'post',
          path: '/me/sendMail',
          parameters: [],
        },
        {
          alias: 'delete-mail-message',
          method: 'delete',
          path: '/me/messages/{message-id}',
          parameters: [],
        },
      ],
    },
  };
});

describe('Read-Only Mode', () => {
  it('should only include GET tools in read-only mode', () => {
    const registry = new ToolRegistry({ readOnly: true });

    expect(registry.size).toBe(1);
    expect(registry.get('list-mail-messages')).toBeDefined();
    expect(registry.get('send-mail')).toBeUndefined();
    expect(registry.get('delete-mail-message')).toBeUndefined();
  });

  it('should include all tools when not in read-only mode', () => {
    const registry = new ToolRegistry({ readOnly: false });

    expect(registry.size).toBe(3);
    expect(registry.get('list-mail-messages')).toBeDefined();
    expect(registry.get('send-mail')).toBeDefined();
    expect(registry.get('delete-mail-message')).toBeDefined();
  });
});
