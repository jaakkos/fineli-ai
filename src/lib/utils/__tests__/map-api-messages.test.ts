import { describe, it, expect } from 'vitest';
import { mapApiMessages, type ApiChatMessage } from '../map-api-messages';

describe('mapApiMessages', () => {
  it('returns empty array for undefined input', () => {
    expect(mapApiMessages(undefined)).toEqual([]);
  });

  it('returns empty array for empty array input', () => {
    expect(mapApiMessages([])).toEqual([]);
  });

  it('maps basic user message correctly', () => {
    const input: ApiChatMessage[] = [
      {
        id: 'msg1',
        role: 'user',
        content: 'kaurapuuroa',
        metadata: null,
        createdAt: '2026-02-15T10:00:00.000Z',
      },
    ];

    const result = mapApiMessages(input);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      id: 'msg1',
      role: 'user',
      content: 'kaurapuuroa',
      timestamp: '2026-02-15T10:00:00.000Z',
      options: undefined,
    });
  });

  it('maps assistant message without metadata (no options)', () => {
    const input: ApiChatMessage[] = [
      {
        id: 'msg2',
        role: 'assistant',
        content: 'Lisäsin kaurapuuron ateriallesi.',
        metadata: null,
        createdAt: '2026-02-15T10:00:01.000Z',
      },
    ];

    const result = mapApiMessages(input);
    expect(result).toHaveLength(1);
    expect(result[0].options).toBeUndefined();
  });

  it('correctly converts disambiguation options to ChatMessageOption format', () => {
    // This is the exact structure the API saves to the database
    const input: ApiChatMessage[] = [
      {
        id: 'msg3',
        role: 'assistant',
        content: 'Löysin useita vaihtoehtoja...',
        metadata: {
          questionMetadata: {
            type: 'disambiguation',
            options: [
              { key: '1', label: 'Kaurapuuro, kevytmaito, suolaa', value: 1514 },
              { key: '2', label: 'Kaurapuuro, kevytmaito, suolaton', value: 33448 },
              { key: '3', label: 'Kaurapuuro, vesi, suolaa', value: 1513 },
            ],
          },
        },
        createdAt: '2026-02-15T10:00:02.000Z',
      },
    ];

    const result = mapApiMessages(input);
    expect(result).toHaveLength(1);

    // options should be wrapped in the ChatMessageOption structure
    expect(result[0].options).toBeDefined();
    expect(result[0].options).toHaveLength(1);

    const option = result[0].options![0];
    expect(option.type).toBe('disambiguation');
    expect(option.items).toHaveLength(3);
    expect(option.items[0]).toEqual({ key: '1', label: 'Kaurapuuro, kevytmaito, suolaa' });
    expect(option.items[1]).toEqual({ key: '2', label: 'Kaurapuuro, kevytmaito, suolaton' });
    expect(option.items[2]).toEqual({ key: '3', label: 'Kaurapuuro, vesi, suolaa' });

    // value should NOT leak into items (it's for internal engine use)
    expect(option.items[0]).not.toHaveProperty('value');
  });

  it('correctly converts portion question options', () => {
    const input: ApiChatMessage[] = [
      {
        id: 'msg4',
        role: 'assistant',
        content: 'Kuinka paljon kaurapuuroa söit?',
        metadata: {
          questionMetadata: {
            type: 'portion',
            options: [
              { key: 'pieni', label: 'Pieni annos (150g)' },
              { key: 'keskikokoinen', label: 'Keskikokoinen annos (230g)' },
              { key: 'iso', label: 'Iso annos (320g)' },
            ],
          },
        },
        createdAt: '2026-02-15T10:00:03.000Z',
      },
    ];

    const result = mapApiMessages(input);
    expect(result[0].options).toHaveLength(1);
    expect(result[0].options![0].type).toBe('portion');
    expect(result[0].options![0].items).toHaveLength(3);
  });

  it('handles metadata with empty options array', () => {
    const input: ApiChatMessage[] = [
      {
        id: 'msg5',
        role: 'assistant',
        content: 'Something happened',
        metadata: {
          questionMetadata: {
            type: 'disambiguation',
            options: [],
          },
        },
        createdAt: '2026-02-15T10:00:04.000Z',
      },
    ];

    const result = mapApiMessages(input);
    // Empty options should NOT create ChatMessageOption (avoids empty button groups)
    expect(result[0].options).toBeUndefined();
  });

  it('handles metadata with missing options field', () => {
    const input: ApiChatMessage[] = [
      {
        id: 'msg6',
        role: 'assistant',
        content: 'Confirmation message',
        metadata: {
          questionMetadata: {
            type: 'confirmation',
          },
        },
        createdAt: '2026-02-15T10:00:05.000Z',
      },
    ];

    const result = mapApiMessages(input);
    expect(result[0].options).toBeUndefined();
  });

  it('handles metadata without questionMetadata field', () => {
    const input: ApiChatMessage[] = [
      {
        id: 'msg7',
        role: 'assistant',
        content: 'Just a message',
        metadata: { someOtherField: true },
        createdAt: '2026-02-15T10:00:06.000Z',
      },
    ];

    const result = mapApiMessages(input);
    expect(result[0].options).toBeUndefined();
  });

  it('maps multiple messages preserving order', () => {
    const input: ApiChatMessage[] = [
      {
        id: 'u1',
        role: 'user',
        content: 'kaurapuuroa',
        metadata: null,
        createdAt: '2026-02-15T10:00:00.000Z',
      },
      {
        id: 'a1',
        role: 'assistant',
        content: 'Löysin vaihtoehtoja...',
        metadata: {
          questionMetadata: {
            type: 'disambiguation',
            options: [
              { key: '1', label: 'Option A', value: 100 },
              { key: '2', label: 'Option B', value: 200 },
            ],
          },
        },
        createdAt: '2026-02-15T10:00:01.000Z',
      },
      {
        id: 'u2',
        role: 'user',
        content: '1',
        metadata: null,
        createdAt: '2026-02-15T10:00:02.000Z',
      },
      {
        id: 'a2',
        role: 'assistant',
        content: 'Lisätty!',
        metadata: null,
        createdAt: '2026-02-15T10:00:03.000Z',
      },
    ];

    const result = mapApiMessages(input);
    expect(result).toHaveLength(4);
    expect(result[0].role).toBe('user');
    expect(result[0].options).toBeUndefined();
    expect(result[1].role).toBe('assistant');
    expect(result[1].options).toHaveLength(1);
    expect(result[2].role).toBe('user');
    expect(result[3].role).toBe('assistant');
    expect(result[3].options).toBeUndefined();
  });

  it('system messages are mapped correctly', () => {
    const input: ApiChatMessage[] = [
      {
        id: 's1',
        role: 'system',
        content: 'Session started',
        metadata: null,
        createdAt: '2026-02-15T10:00:00.000Z',
      },
    ];

    const result = mapApiMessages(input);
    expect(result[0].role).toBe('system');
    expect(result[0].options).toBeUndefined();
  });

  it('REGRESSION: flat API options are NOT passed directly as ChatMessageOption', () => {
    // This was the bug: flat [{key, label, value}] was passed directly,
    // causing ChatMessage to call opt.items which was undefined → crash
    const input: ApiChatMessage[] = [
      {
        id: 'regression',
        role: 'assistant',
        content: 'Pick one',
        metadata: {
          questionMetadata: {
            type: 'disambiguation',
            options: [
              { key: '1', label: 'A', value: 1 },
              { key: '2', label: 'B', value: 2 },
            ],
          },
        },
        createdAt: '2026-02-15T10:00:00.000Z',
      },
    ];

    const result = mapApiMessages(input);
    const opts = result[0].options;

    // Must NOT be the flat array directly
    expect(opts).toBeDefined();
    expect(opts!.length).toBe(1); // Wrapped in a single ChatMessageOption

    // Each ChatMessageOption must have .items (not .key/.label at top level)
    const chatOption = opts![0];
    expect(chatOption).toHaveProperty('type');
    expect(chatOption).toHaveProperty('items');
    expect(Array.isArray(chatOption.items)).toBe(true);
    expect(chatOption.items.length).toBe(2);

    // Verify it won't crash QuickReplyButtons which calls items.map()
    const rendered = chatOption.items.map((item) => item.label);
    expect(rendered).toEqual(['A', 'B']);
  });
});
