import { createRoute, z } from '@hono/zod-openapi';
import { FileSchema, ErrorSchema, ProbeResponseSchema } from '~/utils/schemas';

/**
 * POST /media/info - Probe media file and return metadata
 */
export const probeMediaRoute = createRoute({
  method: 'post',
  path: '/media/info',
  tags: ['Media'],
  request: {
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
          schema: ProbeResponseSchema
        }
      },
      description: 'Media file metadata and stream information'
    },
    400: {
      content: {
        'application/json': {
          schema: ErrorSchema
        }
      },
      description: 'Invalid media file'
    },
    500: {
      content: {
        'application/json': {
          schema: ErrorSchema
        }
      },
      description: 'Probe failed'
    },
    501: {
      content: {
        'application/json': {
          schema: ErrorSchema
        }
      },
      description: 'Not implemented'
    }
  }
});
