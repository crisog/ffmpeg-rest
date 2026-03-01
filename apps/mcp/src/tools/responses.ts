import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

const serialize = (value: unknown): string => {
  if (typeof value === 'string') {
    return value;
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};

export const successResponse = <T extends Record<string, unknown>>(data: T): CallToolResult => ({
  content: [
    {
      type: 'text',
      text: serialize(data)
    }
  ],
  structuredContent: data
});

export const errorResponse = (message: string): CallToolResult => ({
  content: [
    {
      type: 'text',
      text: message
    }
  ],
  isError: true
});
