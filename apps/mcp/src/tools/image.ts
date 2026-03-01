import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { postFileBinary } from '~/client.js';
import { deriveOutputPath } from '~/utils.js';
import { successResponse, errorResponse } from './responses.js';
import { extname, basename, dirname, join } from 'node:path';

export const registerImageTools = (server: McpServer): void => {
  server.registerTool(
    'ffmpeg_image_to_jpg',
    {
      title: 'Convert Image to JPG',
      description: 'Convert any image format to JPG.',
      inputSchema: {
        filePath: z.string().describe('Absolute path to the input image file.'),
        quality: z.number().int().min(1).max(31).optional().describe('JPG quality (1=best, 31=worst, default 2).')
      },
      outputSchema: {
        outputPath: z.string().describe('Absolute path to the converted JPG file.')
      }
    },
    async ({ filePath, quality }) => {
      try {
        const outputPath = deriveOutputPath(filePath, 'jpg');
        await postFileBinary('/image/jpg', filePath, outputPath, { quality });
        return successResponse({ outputPath });
      } catch (error) {
        return errorResponse(error instanceof Error ? error.message : String(error));
      }
    }
  );

  server.registerTool(
    'ffmpeg_image_resize',
    {
      title: 'Resize Image',
      description: 'Resize an image. Preserves the original format. At least one of width or height must be provided.',
      inputSchema: {
        filePath: z.string().describe('Absolute path to the input image file.'),
        width: z.number().int().positive().max(8192).optional().describe('Target width in pixels.'),
        height: z.number().int().positive().max(8192).optional().describe('Target height in pixels.'),
        mode: z
          .enum(['fit', 'fill', 'force'])
          .optional()
          .describe(
            'Resize mode: fit (preserve aspect, no crop), fill (preserve aspect, crop), force (ignore aspect). Default: fit.'
          )
      },
      outputSchema: {
        outputPath: z.string().describe('Absolute path to the resized image file.')
      }
    },
    async ({ filePath, width, height, mode }) => {
      try {
        if (!width && !height) {
          return errorResponse('At least one of width or height must be provided.');
        }
        // Preserve original extension — use _resized suffix to avoid overwriting input
        const ext = extname(filePath).slice(1) || 'png';
        const dir = dirname(filePath);
        const base = basename(filePath, extname(filePath));
        const outputPath = join(dir, `${base}_resized.${ext}`);
        await postFileBinary('/image/resize', filePath, outputPath, { width, height, mode });
        return successResponse({ outputPath });
      } catch (error) {
        return errorResponse(error instanceof Error ? error.message : String(error));
      }
    }
  );
};
