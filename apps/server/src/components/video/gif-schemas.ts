import { createRoute, z } from '@hono/zod-openapi';
import { FileSchema, ErrorSchema, GifQuerySchema, UrlResponseSchema } from '~/utils/schemas';

/**
 * POST /video/gif - Convert video to animated GIF
 */
export const videoToGifRoute = createRoute({
  method: 'post',
  path: '/video/gif',
  tags: ['Video'],
  request: {
    query: GifQuerySchema,
    body: {
      content: {
        'multipart/form-data': {
          schema: z.object({
            file: FileSchema
          })
        }
      },
      required: true
    }
  },
  responses: {
    200: {
      content: {
        'image/gif': {
          schema: FileSchema
        }
      },
      description: 'Video converted to animated GIF'
    },
    400: {
      content: {
        'application/json': {
          schema: ErrorSchema
        }
      },
      description: 'Invalid video file or unsupported format'
    },
    500: {
      content: {
        'application/json': {
          schema: ErrorSchema
        }
      },
      description: 'Conversion failed'
    }
  }
});

/**
 * POST /video/gif/url - Convert video to animated GIF and return S3 URL
 */
export const videoToGifUrlRoute = createRoute({
  method: 'post',
  path: '/video/gif/url',
  tags: ['Video'],
  request: {
    query: GifQuerySchema,
    body: {
      content: {
        'multipart/form-data': {
          schema: z.object({
            file: FileSchema
          })
        }
      },
      required: true
    }
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: UrlResponseSchema
        }
      },
      description: 'Video converted to GIF and uploaded to S3'
    },
    400: {
      content: {
        'application/json': {
          schema: ErrorSchema
        }
      },
      description: 'Invalid video file or S3 mode not enabled'
    },
    500: {
      content: {
        'application/json': {
          schema: ErrorSchema
        }
      },
      description: 'Conversion failed'
    }
  }
});
