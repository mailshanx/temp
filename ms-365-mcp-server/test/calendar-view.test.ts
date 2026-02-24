import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { ToolRegistry } from '../src/tool-registry.js';
import { executeTool } from '../src/tool-executor.js';
import type GraphClient from '../src/graph-client.js';

vi.mock('../src/logger.js', () => ({
  default: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock('../src/generated/client.js', () => ({
  api: {
    endpoints: [
      {
        alias: 'get-calendar-view',
        method: 'get',
        path: '/me/calendarView',
        description: 'The calendar view for the calendar.',
        parameters: [
          { name: 'startDateTime', type: 'Query', schema: z.string() },
          { name: 'endDateTime', type: 'Query', schema: z.string() },
          { name: 'top', type: 'Query', schema: z.number().int().optional() },
          { name: 'skip', type: 'Query', schema: z.number().int().optional() },
          { name: 'select', type: 'Query', schema: z.array(z.string()).optional() },
          { name: 'orderby', type: 'Query', schema: z.array(z.string()).optional() },
          { name: 'filter', type: 'Query', schema: z.string().optional() },
          { name: 'expand', type: 'Query', schema: z.array(z.string()).optional() },
        ],
      },
      {
        alias: 'get-specific-calendar-view',
        method: 'get',
        path: '/me/calendars/:calendarId/calendarView',
        description: 'The calendar view for a specific calendar.',
        parameters: [
          { name: 'calendarId', type: 'Path', schema: z.string() },
          { name: 'startDateTime', type: 'Query', schema: z.string() },
          { name: 'endDateTime', type: 'Query', schema: z.string() },
          { name: 'top', type: 'Query', schema: z.number().int().optional() },
          { name: 'skip', type: 'Query', schema: z.number().int().optional() },
          { name: 'select', type: 'Query', schema: z.array(z.string()).optional() },
          { name: 'orderby', type: 'Query', schema: z.array(z.string()).optional() },
          { name: 'filter', type: 'Query', schema: z.string().optional() },
          { name: 'expand', type: 'Query', schema: z.array(z.string()).optional() },
        ],
      },
      {
        alias: 'list-calendar-event-instances',
        method: 'get',
        path: '/me/calendars/:calendarId/events/:eventId/instances',
        description: 'Expand recurring event instances.',
        parameters: [
          { name: 'calendarId', type: 'Path', schema: z.string() },
          { name: 'eventId', type: 'Path', schema: z.string() },
          { name: 'startDateTime', type: 'Query', schema: z.string() },
          { name: 'endDateTime', type: 'Query', schema: z.string() },
        ],
      },
    ],
  },
}));

describe('Calendar View Tools', () => {
  let registry: ToolRegistry;
  let mockGraphClient: GraphClient;

  beforeEach(() => {
    vi.clearAllMocks();
    registry = new ToolRegistry();
    mockGraphClient = {
      graphRequest: vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: JSON.stringify({ value: [] }) }],
      }),
    } as unknown as GraphClient;
  });

  describe('tool registration', () => {
    it('should register all three calendar view/instances tools', () => {
      expect(registry.get('get-calendar-view')).toBeDefined();
      expect(registry.get('get-specific-calendar-view')).toBeDefined();
      expect(registry.get('list-calendar-event-instances')).toBeDefined();
    });

    it('should append llmTip to tool descriptions', () => {
      const calView = registry.get('get-calendar-view');
      expect(calView?.description).toContain('TIP:');
      expect(calView?.description).toContain('recurring event instances');

      const specificCalView = registry.get('get-specific-calendar-view');
      expect(specificCalView?.description).toContain('TIP:');
      expect(specificCalView?.description).toContain('recurring event instances');

      const instances = registry.get('list-calendar-event-instances');
      expect(instances?.description).toContain('TIP:');
      expect(instances?.description).toContain('startDateTime and endDateTime');
    });
  });

  describe('tool execution', () => {
    it('should call graphRequest with correct path for specific calendar view', async () => {
      const entry = registry.get('get-specific-calendar-view')!;

      await executeTool(entry, mockGraphClient, {
        calendarId: 'cal-abc-123',
        startDateTime: '2024-01-01T00:00:00Z',
        endDateTime: '2024-01-31T23:59:59Z',
      });

      expect(mockGraphClient.graphRequest).toHaveBeenCalledWith(
        expect.stringContaining('/me/calendars/cal-abc-123/calendarView'),
        expect.objectContaining({ method: 'GET' })
      );

      const calledPath = (mockGraphClient.graphRequest as ReturnType<typeof vi.fn>).mock
        .calls[0][0] as string;
      expect(calledPath).toContain('startDateTime=2024-01-01T00%3A00%3A00Z');
      expect(calledPath).toContain('endDateTime=2024-01-31T23%3A59%3A59Z');
    });

    it('should set timezone header when timezone param is provided', async () => {
      const entry = registry.get('get-specific-calendar-view')!;

      await executeTool(entry, mockGraphClient, {
        calendarId: 'cal-abc-123',
        startDateTime: '2024-01-01T00:00:00Z',
        endDateTime: '2024-01-31T23:59:59Z',
        timezone: 'Australia/Sydney',
      });

      expect(mockGraphClient.graphRequest).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            Prefer: 'outlook.timezone="Australia/Sydney"',
          }),
        })
      );
    });

    it('should add $expand for extended properties when requested', async () => {
      const entry = registry.get('get-specific-calendar-view')!;

      await executeTool(entry, mockGraphClient, {
        calendarId: 'cal-abc-123',
        startDateTime: '2024-01-01T00:00:00Z',
        endDateTime: '2024-01-31T23:59:59Z',
        expandExtendedProperties: true,
      });

      const calledPath = (mockGraphClient.graphRequest as ReturnType<typeof vi.fn>).mock
        .calls[0][0] as string;
      expect(calledPath).toContain('%24expand=singleValueExtendedProperties');
    });

    it('should append to existing $expand when expandExtendedProperties is set', async () => {
      const entry = registry.get('get-specific-calendar-view')!;

      await executeTool(entry, mockGraphClient, {
        calendarId: 'cal-abc-123',
        startDateTime: '2024-01-01T00:00:00Z',
        endDateTime: '2024-01-31T23:59:59Z',
        expand: ['extensions'],
        expandExtendedProperties: true,
      });

      const calledPath = (mockGraphClient.graphRequest as ReturnType<typeof vi.fn>).mock
        .calls[0][0] as string;
      expect(calledPath).toContain('%24expand=extensions%2CsingleValueExtendedProperties');
    });

    it('should pass $top query parameter when provided', async () => {
      const entry = registry.get('get-specific-calendar-view')!;

      await executeTool(entry, mockGraphClient, {
        calendarId: 'cal-abc-123',
        startDateTime: '2024-01-01T00:00:00Z',
        endDateTime: '2024-01-31T23:59:59Z',
        top: 50,
      });

      const calledPath = (mockGraphClient.graphRequest as ReturnType<typeof vi.fn>).mock
        .calls[0][0] as string;
      expect(calledPath).toContain('%24top=50');
    });

    it('should call graphRequest with correct path for event instances', async () => {
      const entry = registry.get('list-calendar-event-instances')!;

      await executeTool(entry, mockGraphClient, {
        calendarId: 'cal-abc-123',
        eventId: 'event-xyz-456',
        startDateTime: '2024-01-01T00:00:00Z',
        endDateTime: '2024-12-31T23:59:59Z',
      });

      expect(mockGraphClient.graphRequest).toHaveBeenCalledWith(
        expect.stringContaining('/me/calendars/cal-abc-123/events/event-xyz-456/instances'),
        expect.objectContaining({ method: 'GET' })
      );
    });
  });
});
