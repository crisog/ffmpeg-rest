import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { postFileJson } from '~/client.js';
import { successResponse, errorResponse } from './responses.js';

export const registerMediaTools = (server: McpServer): void => {
  server.registerTool(
    'ffmpeg_media_info',
    {
      title: 'Get Media Info',
      description: 'Get detailed metadata about a media file (format, codecs, streams, duration, bitrate).',
      inputSchema: {
        filePath: z.string().describe('Absolute path to the media file to probe.')
      },
      outputSchema: {
        format: z.object({
          filename: z.string(),
          nb_streams: z.number(),
          format_name: z.string(),
          format_long_name: z.string(),
          duration: z.string(),
          size: z.string(),
          bit_rate: z.string()
        }),
        streams: z.array(
          z.object({
            index: z.number(),
            codec_name: z.string(),
            codec_type: z.string(),
            codec_long_name: z.string().optional(),
            width: z.number().optional(),
            height: z.number().optional(),
            sample_rate: z.string().optional(),
            channels: z.number().optional()
          })
        )
      }
    },
    async ({ filePath }) => {
      try {
        const result = await postFileJson<Record<string, unknown>>('/media/info', filePath);
        return successResponse(result);
      } catch (error) {
        return errorResponse(error instanceof Error ? error.message : String(error));
      }
    }
  );
};
