import { z } from '@hono/zod-openapi';

/**
 * Common file upload schema
 */
export const FileSchema = z.file().openapi({
  type: 'string',
  format: 'binary',
  description: 'Media file to process'
});

/**
 * Query parameters
 */
export const MonoQuerySchema = z.object({
  mono: z
    .enum(['yes', 'no'])
    .optional()
    .default('yes')
    .openapi({
      param: {
        name: 'mono',
        in: 'query'
      },
      example: 'yes',
      description: 'Extract mono audio (yes) or all channels (no)'
    })
});

export const CompressQuerySchema = z.object({
  compress: z
    .enum(['zip', 'gzip'])
    .optional()
    .openapi({
      param: {
        name: 'compress',
        in: 'query'
      },
      example: 'zip',
      description: 'Compression format for extracted images'
    })
});

export const FpsQuerySchema = z.object({
  fps: z
    .string()
    .regex(/^\d+$/)
    .transform(Number)
    .pipe(z.number().int().positive())
    .optional()
    .default(1)
    .openapi({
      param: {
        name: 'fps',
        in: 'query'
      },
      example: '1',
      description: 'Frames per second for image extraction'
    })
});

export const DeleteQuerySchema = z.object({
  delete: z
    .enum(['yes', 'no'])
    .optional()
    .default('yes')
    .openapi({
      param: {
        name: 'delete',
        in: 'query'
      },
      example: 'yes',
      description: 'Delete file after download (yes) or keep it (no)'
    })
});

export const ResizeModeSchema = z.enum(['fit', 'fill', 'force']).openapi({
  example: 'fit',
  description:
    'Resize mode: fit (preserve aspect ratio, no crop), fill (preserve aspect ratio, crop overflow), force (ignore aspect ratio)'
});

export const ResizeQuerySchema = z.object({
  width: z
    .string()
    .regex(/^\d+$/)
    .transform(Number)
    .pipe(z.number().int().positive().max(8192))
    .optional()
    .openapi({
      param: {
        name: 'width',
        in: 'query'
      },
      example: '1920',
      description: 'Target width in pixels (max 8192)'
    }),
  height: z
    .string()
    .regex(/^\d+$/)
    .transform(Number)
    .pipe(z.number().int().positive().max(8192))
    .optional()
    .openapi({
      param: {
        name: 'height',
        in: 'query'
      },
      example: '1080',
      description: 'Target height in pixels (max 8192)'
    }),
  mode: ResizeModeSchema.optional()
    .default('fit')
    .openapi({
      param: {
        name: 'mode',
        in: 'query'
      }
    })
});

/**
 * Path parameters
 */
export const FilenameParamSchema = z.object({
  filename: z.string().openapi({
    param: {
      name: 'filename',
      in: 'path'
    },
    example: 'image_001.png',
    description: 'Name of the file to download'
  })
});

/**
 * Response schemas
 */
export const ErrorSchema = z
  .object({
    error: z.string().openapi({
      example: 'Invalid file format'
    }),
    message: z.string().optional().openapi({
      example: 'The uploaded file is not a valid audio format'
    })
  })
  .openapi('Error');

export const EndpointsResponseSchema = z
  .object({
    endpoints: z.array(
      z.object({
        path: z.string(),
        method: z.string(),
        description: z.string()
      })
    )
  })
  .openapi('EndpointsResponse');

export const ExtractImagesResponseSchema = z
  .object({
    images: z.array(
      z.object({
        filename: z.string(),
        downloadUrl: z.string()
      })
    ),
    totalImages: z.number()
  })
  .openapi('ExtractImagesResponse');

export const ProbeResponseSchema = z
  .object({
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
  })
  .openapi('ProbeResponse');

export const UrlResponseSchema = z
  .object({
    url: z.url().openapi({
      example: 'https://pub-xxx.r2.dev/ffmpeg-rest/2025-01-05-abc123/output.mp3'
    })
  })
  .openapi('UrlResponse');
