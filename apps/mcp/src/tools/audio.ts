import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { postFileBinary } from '~/client.js';
import { deriveOutputPath } from '~/utils.js';
import { successResponse, errorResponse } from './responses.js';

export const registerAudioTools = (server: McpServer): void => {
  server.registerTool(
    'ffmpeg_audio_to_mp3',
    {
      title: 'Convert Audio to MP3',
      description:
        'Convert any audio file to MP3 format. Accepts a local file path and writes the output next to the input file.',
      inputSchema: {
        filePath: z.string().describe('Absolute path to the input audio file.'),
        quality: z.number().int().min(0).max(9).optional().describe('VBR quality (0=best, 9=worst, default 2).')
      },
      outputSchema: {
        outputPath: z.string().describe('Absolute path to the converted MP3 file.')
      }
    },
    async ({ filePath, quality }) => {
      try {
        const outputPath = deriveOutputPath(filePath, 'mp3');
        await postFileBinary('/audio/mp3', filePath, outputPath, { quality });
        return successResponse({ outputPath });
      } catch (error) {
        return errorResponse(error instanceof Error ? error.message : String(error));
      }
    }
  );

  server.registerTool(
    'ffmpeg_audio_to_wav',
    {
      title: 'Convert Audio to WAV',
      description: 'Convert any audio file to WAV format.',
      inputSchema: {
        filePath: z.string().describe('Absolute path to the input audio file.')
      },
      outputSchema: {
        outputPath: z.string().describe('Absolute path to the converted WAV file.')
      }
    },
    async ({ filePath }) => {
      try {
        const outputPath = deriveOutputPath(filePath, 'wav');
        await postFileBinary('/audio/wav', filePath, outputPath);
        return successResponse({ outputPath });
      } catch (error) {
        return errorResponse(error instanceof Error ? error.message : String(error));
      }
    }
  );
};
