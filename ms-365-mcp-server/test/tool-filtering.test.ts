import { describe, expect, it, vi } from 'vitest';
import { ToolRegistry } from '../src/tool-registry.js';

vi.mock('../src/logger.js', () => ({
  default: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../src/generated/client.js', () => ({
  api: {
    endpoints: [
      {
        alias: 'list-mail-messages',
        method: 'GET',
        path: '/me/messages',
        description: 'List mail messages',
      },
      { alias: 'send-mail', method: 'POST', path: '/me/sendMail', description: 'Send mail' },
      {
        alias: 'list-calendar-events',
        method: 'GET',
        path: '/me/events',
        description: 'List calendar events',
      },
      {
        alias: 'list-excel-worksheets',
        method: 'GET',
        path: '/workbook/worksheets',
        description: 'List Excel worksheets',
      },
      { alias: 'get-current-user', method: 'GET', path: '/me', description: 'Get current user' },
    ],
  },
}));

describe('Tool Filtering', () => {
  it('should register all tools when no filter is provided', () => {
    const registry = new ToolRegistry();

    expect(registry.size).toBe(5);
    expect(registry.get('list-mail-messages')).toBeDefined();
    expect(registry.get('send-mail')).toBeDefined();
    expect(registry.get('list-calendar-events')).toBeDefined();
    expect(registry.get('list-excel-worksheets')).toBeDefined();
    expect(registry.get('get-current-user')).toBeDefined();
  });

  it('should filter tools by regex pattern - mail only', () => {
    const registry = new ToolRegistry({ enabledToolsPattern: 'mail' });

    expect(registry.size).toBe(2);
    expect(registry.get('list-mail-messages')).toBeDefined();
    expect(registry.get('send-mail')).toBeDefined();
  });

  it('should filter tools by regex pattern - calendar or excel', () => {
    const registry = new ToolRegistry({ enabledToolsPattern: 'calendar|excel' });

    expect(registry.size).toBe(2);
    expect(registry.get('list-calendar-events')).toBeDefined();
    expect(registry.get('list-excel-worksheets')).toBeDefined();
  });

  it('should handle invalid regex patterns gracefully', () => {
    const registry = new ToolRegistry({ enabledToolsPattern: '[invalid regex' });

    // Invalid regex is ignored, all tools registered
    expect(registry.size).toBe(5);
  });

  it('should combine read-only and filtering correctly', () => {
    const registry = new ToolRegistry({ readOnly: true, enabledToolsPattern: 'mail' });

    expect(registry.size).toBe(1);
    expect(registry.get('list-mail-messages')).toBeDefined();
    // send-mail is POST, filtered by readOnly
    expect(registry.get('send-mail')).toBeUndefined();
  });

  it('should register no tools when pattern matches nothing', () => {
    const registry = new ToolRegistry({ enabledToolsPattern: 'nonexistent' });

    expect(registry.size).toBe(0);
  });
});
