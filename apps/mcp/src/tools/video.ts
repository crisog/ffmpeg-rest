import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { postFileBinary } from '~/client.js';
import { deriveOutputPath } from '~/utils.js';
import { successResponse, errorResponse } from './responses.js';

export const registerVideoTools = (server: McpServer): void => {
  server.registerTool(
    'ffmpeg_video_to_mp4',
    {
      title: 'Convert Video to MP4',
      description: 'Convert any video format to MP4.',
      inputSchema: {
        filePath: z.string().describe('Absolute path to the input video file.'),
        crf: z
          .number()
          .int()
          .min(0)
          .max(51)
          .optional()
          .describe('Constant rate factor (0=lossless, 51=worst, default 23).'),
        preset: z
          .enum(['ultrafast', 'superfast', 'veryfast', 'faster', 'fast', 'medium', 'slow', 'slower', 'veryslow'])
          .optional()
          .describe('Encoding speed preset (default: medium).'),
        smartCopy: z.boolean().optional().describe('Copy stream if already compatible codec (default: true).')
      },
      outputSchema: {
        outputPath: z.string().describe('Absolute path to the converted MP4 file.')
      }
    },
    async ({ filePath, crf, preset, smartCopy }) => {
      try {
        const outputPath = deriveOutputPath(filePath, 'mp4');
        await postFileBinary('/video/mp4', filePath, outputPath, { crf, preset, smartCopy });
        return successResponse({ outputPath });
      } catch (error) {
        return errorResponse(error instanceof Error ? error.message : String(error));
      }
    }
  );

  server.registerTool(
    'ffmpeg_video_extract_audio',
    {
      title: 'Extract Audio from Video',
      description: 'Extract the audio track from a video file as WAV.',
      inputSchema: {
        filePath: z.string().describe('Absolute path to the input video file.'),
        mono: z.enum(['yes', 'no']).optional().describe('Extract mono (yes) or all channels (no). Default: yes.')
      },
      outputSchema: {
        outputPath: z.string().describe('Absolute path to the extracted WAV file.')
      }
    },
    async ({ filePath, mono }) => {
      try {
        const outputPath = deriveOutputPath(filePath, 'wav');
        await postFileBinary('/video/audio', filePath, outputPath, { mono });
        return successResponse({ outputPath });
      } catch (error) {
        return errorResponse(error instanceof Error ? error.message : String(error));
      }
    }
  );

  server.registerTool(
    'ffmpeg_video_extract_frames',
    {
      title: 'Extract Frames from Video',
      description: 'Extract frames from a video as a ZIP or GZIP archive of PNG images.',
      inputSchema: {
        filePath: z.string().describe('Absolute path to the input video file.'),
        fps: z.number().int().positive().optional().describe('Frames per second to extract (default: 1).'),
        compress: z.enum(['zip', 'gzip']).describe('Archive format for the extracted frames.')
      },
      outputSchema: {
        outputPath: z.string().describe('Absolute path to the frames archive (.zip or .tar.gz).')
      }
    },
    async ({ filePath, fps, compress }) => {
      try {
        const ext = compress === 'zip' ? 'zip' : 'tar.gz';
        const outputPath = deriveOutputPath(filePath, ext);
        await postFileBinary('/video/frames', filePath, outputPath, { fps, compress });
        return successResponse({ outputPath });
      } catch (error) {
        return errorResponse(error instanceof Error ? error.message : String(error));
      }
    }
  );

  server.registerTool(
    'ffmpeg_video_to_gif',
    {
      title: 'Convert Video to GIF',
      description: 'Convert a video file to an animated GIF.',
      inputSchema: {
        filePath: z.string().describe('Absolute path to the input video file.'),
        fps: z.number().int().min(1).max(30).optional().describe('Frames per second for the GIF (1-30, default: 10).'),
        width: z
          .number()
          .int()
          .positive()
          .max(1920)
          .optional()
          .describe('Target width in pixels. Height auto-scales to maintain aspect ratio.')
      },
      outputSchema: {
        outputPath: z.string().describe('Absolute path to the converted GIF file.')
      }
    },
    async ({ filePath, fps, width }) => {
      try {
        const outputPath = deriveOutputPath(filePath, 'gif');
        await postFileBinary('/video/gif', filePath, outputPath, { fps, width });
        return successResponse({ outputPath });
      } catch (error) {
        return errorResponse(error instanceof Error ? error.message : String(error));
      }
    }
  );
};
